-- CRM: el «Tipo de cliente» se calcula solo (29 oct 2026, pedido de Alcides) con el promedio de pedidos al mes de los últimos 3 meses (sin
-- cancelados) de las cuentas vinculadas del dropshipper. Los umbrales son **por país** y se editan en Configuración (`crm_tipo_cliente_umbrales`):
-- VIP desde `vip_desde` y BLACK desde `black_desde` pedidos al mes; por debajo, ROOKIE. Un país sin fila usa 500 y 1 000. Si vende en varios países,
-- se mide en cada uno con sus umbrales y queda el tipo más alto. Se recalcula cada vez que se leen los pedidos de Dropi (después de
-- `crm_sincronizar_ordenes`) y al cambiar los umbrales. Si alguien lo fija a mano (`nivel_manual`), el cálculo no lo toca. Un cliente con menos de
-- 90 días de pedidos en un país se promedia por los días que tiene (mínimo 30). Cada cambio automático queda en la auditoría a nombre de «Sistema».
-- RLS sin políticas (migración 0063). Reversa: supabase/rollbacks/0196_rollback.sql

alter table dropshippers add column if not exists nivel_manual boolean not null default false;
alter table dropshippers add column if not exists promedio_pedidos_mes numeric(10, 1);

create table if not exists crm_tipo_cliente_umbrales (
  pais_id uuid primary key references paises(id) on delete cascade,
  vip_desde integer not null default 500 check (vip_desde > 0),
  black_desde integer not null default 1000 check (black_desde > 0),
  actualizado_en timestamptz not null default now(),
  check (black_desde > vip_desde)
);
alter table crm_tipo_cliente_umbrales enable row level security;
insert into crm_tipo_cliente_umbrales (pais_id) select id from paises on conflict do nothing;

create or replace function crm_recalcular_tipo_cliente() returns integer
language plpgsql as $$
declare cambiados integer;
begin
  with por_pais as (
    select c.dropshipper_id, c.pais_id, count(*) as n, min(o.fecha) as primero
    from dropshipper_cuentas c
    join crm_ordenes o on o.plataforma_id = c.plataforma_id and o.pais_id = c.pais_id and o.usuario_externo = c.id_externo
    where o.fecha >= (now() at time zone 'America/Panama') - interval '90 days'
      and upper(o.estado) not like 'CANCELAD%'
    group by c.dropshipper_id, c.pais_id
  ),
  medidos as (
    select p.dropshipper_id,
      round(p.n * 30.0 / greatest(30, least(90, extract(epoch from ((now() at time zone 'America/Panama') - p.primero)) / 86400.0)), 1) as promedio,
      coalesce(u.vip_desde, 500) as vip_desde, coalesce(u.black_desde, 1000) as black_desde
    from por_pais p left join crm_tipo_cliente_umbrales u on u.pais_id = p.pais_id
  ),
  por_ds as (
    select dropshipper_id, max(promedio) as promedio,
      max(case when promedio >= black_desde then 2 when promedio >= vip_desde then 1 else 0 end) as rango
    from medidos group by dropshipper_id
  ),
  calculado as (
    select d.id, coalesce(x.promedio, 0) as promedio, d.nivel as antes,
      case when d.nivel_manual then d.nivel when coalesce(x.rango, 0) = 2 then 'black' when coalesce(x.rango, 0) = 1 then 'vip' else 'regular' end as nivel
    from dropshippers d left join por_ds x on x.dropshipper_id = d.id
  ),
  actualizados as (
    update dropshippers d
    set promedio_pedidos_mes = c.promedio, nivel = c.nivel
    from calculado c
    where c.id = d.id and (d.promedio_pedidos_mes is distinct from c.promedio or d.nivel <> c.nivel)
    returning d.id, c.antes, c.nivel as despues, c.promedio
  ),
  auditados as (
    insert into historial_auditoria (usuario_nombre, accion, entidad, entidad_id, detalle, antes, despues)
    select 'Sistema', 'tipo_cliente_dropshipper', 'dropshippers', a.id::text,
      'Automático: promedio de ' || a.promedio || ' pedidos al mes en los últimos 3 meses',
      jsonb_build_object('Tipo de cliente', case a.antes when 'black' then 'Black' when 'vip' then 'VIP' else 'Rookie' end),
      jsonb_build_object('Tipo de cliente', case a.despues when 'black' then 'Black' when 'vip' then 'VIP' else 'Rookie' end)
    from actualizados a where a.antes <> a.despues
    returning 1
  )
  select count(*) into cambiados from auditados;
  return cambiados;
end $$;

-- La primera vez, con lo que ya hay.
select crm_recalcular_tipo_cliente();
