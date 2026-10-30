-- CRM: el «Tipo de cliente» se calcula solo (29 oct 2026, pedido de Alcides) con el promedio de pedidos al mes de los últimos 3 meses
-- (sin cancelados), de las cuentas vinculadas del dropshipper: ROOKIE por debajo de 500, VIP desde 500 y BLACK desde 1 000. Se recalcula cada vez
-- que se leen los pedidos de Dropi (después de `crm_sincronizar_ordenes`). Si alguien lo fija a mano (`nivel_manual`), el cálculo no lo toca.
-- Un cliente con menos de 90 días de pedidos (o desde que empezamos a importar) se promedia por los días que tiene (mínimo 30), para no bajarle el
-- promedio por meses sin datos. Cada cambio automático queda en la auditoría a nombre de «Sistema».
-- Reversa: supabase/rollbacks/0196_rollback.sql

alter table dropshippers add column if not exists nivel_manual boolean not null default false;
alter table dropshippers add column if not exists promedio_pedidos_mes numeric(10, 1);

create or replace function crm_recalcular_tipo_cliente() returns integer
language plpgsql as $$
declare cambiados integer;
begin
  with pedidos as (
    select c.dropshipper_id, count(*) as n, min(o.fecha) as primero
    from dropshipper_cuentas c
    join crm_ordenes o on o.plataforma_id = c.plataforma_id and o.pais_id = c.pais_id and o.usuario_externo = c.id_externo
    where o.fecha >= (now() at time zone 'America/Panama') - interval '90 days'
      and upper(o.estado) not like 'CANCELAD%'
    group by c.dropshipper_id
  ),
  promedios as (
    select d.id,
      coalesce(round(p.n * 30.0 / greatest(30, least(90, extract(epoch from ((now() at time zone 'America/Panama') - p.primero)) / 86400.0)), 1), 0) as promedio
    from dropshippers d left join pedidos p on p.dropshipper_id = d.id
  ),
  calculado as (
    select pr.id, pr.promedio, d.nivel as antes,
      case when d.nivel_manual then d.nivel when pr.promedio >= 1000 then 'black' when pr.promedio >= 500 then 'vip' else 'regular' end as nivel
    from promedios pr join dropshippers d on d.id = pr.id
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
