-- Portal AF4 360°: conexión directa con Dropi para finanzas (mejora 97).
--
-- `fin_dropi_mensual`: pedidos, entregados, ventas entregadas, ganancias liquidadas («ENTRADA POR GANANCIA» del
-- historial de cartera) y retiros aprobados de Dropi por mes y país, calculados en Postgres desde lo que ya ingresan los
-- scripts `scripts/dropi-ingerir-*` (tablas `ordenes`, `historial_cartera`, `retiros`). `fin_sincronizar_dropi()` los
-- vuelve a calcular (llave `dropi|<país>|<mes>`) y deja en la cartera por cobrar un documento por país con el saldo de la
-- billetera (origen 'dropi', llave `dropi-wallet|<país>`; lo editado a mano no se pisa). Volver a correrla actualiza, no
-- duplica. La llama la tarea programada «dropi-finanzas». RLS activado y sin políticas. Se puede correr dos veces.

create table if not exists fin_dropi_mensual (
  periodo date not null check (extract(day from periodo) = 1),
  pais_id uuid not null references paises(id),
  moneda text not null default 'USD',
  pedidos integer not null default 0,
  entregados integer not null default 0,
  -- Total de los pedidos entregados (lo que pagó el cliente final).
  ventas_entregadas numeric(14, 2) not null default 0,
  -- Lo que Dropi acreditó a la billetera por esos pedidos («ENTRADA POR GANANCIA» del historial de cartera).
  ganancias numeric(14, 2) not null default 0,
  -- Retiros aprobados por Dropi (salen de la billetera hacia el banco).
  retiros numeric(14, 2) not null default 0,
  origen_clave text not null unique,
  actualizado_en timestamptz not null default now(),
  primary key (periodo, pais_id)
);
alter table fin_dropi_mensual enable row level security;

-- La cartera admite documentos que crea la sincronización con Dropi.
alter table fin_cartera drop constraint if exists fin_cartera_origen_check;
alter table fin_cartera add constraint fin_cartera_origen_check check (origen in ('manual', 'excel', 'dropi'));

create or replace function fin_sincronizar_dropi()
returns table (meses integer, paises integer, documentos integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_meses integer := 0;
  v_paises integer := 0;
  v_docs integer := 0;
  p record;
  v_saldo numeric(14, 2);
  v_unidad uuid;
begin
  with o as (
    select date_trunc('month', fecha)::date as periodo, pais_id,
           count(*) as pedidos,
           count(*) filter (where upper(estado) = 'ENTREGADO') as entregados,
           coalesce(sum(monto) filter (where upper(estado) = 'ENTREGADO'), 0) as ventas
    from ordenes group by 1, 2
  ), g as (
    select date_trunc('month', fecha)::date as periodo, pais_id, coalesce(sum(monto), 0) as ganancias
    from historial_cartera where upper(tipo) like '%GANANCIA%' and monto > 0 group by 1, 2
  ), r as (
    select date_trunc('month', fecha)::date as periodo, pais_id, coalesce(sum(monto), 0) as retiros
    from retiros where estado_dropi = 'aprobado' group by 1, 2
  ), todo as (
    select coalesce(o.periodo, g.periodo, r.periodo) as periodo, coalesce(o.pais_id, g.pais_id, r.pais_id) as pais_id,
           coalesce(o.pedidos, 0) as pedidos, coalesce(o.entregados, 0) as entregados, coalesce(o.ventas, 0) as ventas,
           coalesce(g.ganancias, 0) as ganancias, coalesce(r.retiros, 0) as retiros
    from o full join g on g.periodo = o.periodo and g.pais_id = o.pais_id
           full join r on r.periodo = coalesce(o.periodo, g.periodo) and r.pais_id = coalesce(o.pais_id, g.pais_id)
  ), ins as (
    insert into fin_dropi_mensual (periodo, pais_id, moneda, pedidos, entregados, ventas_entregadas, ganancias, retiros, origen_clave, actualizado_en)
    select t.periodo, t.pais_id, case when pa.codigo = 'CR' then 'CRC' else 'USD' end, t.pedidos, t.entregados, t.ventas, t.ganancias, t.retiros,
           'dropi|' || pa.codigo || '|' || to_char(t.periodo, 'YYYY-MM'), now()
    from todo t join paises pa on pa.id = t.pais_id
    where t.periodo is not null
    on conflict (origen_clave) do update set
      pedidos = excluded.pedidos, entregados = excluded.entregados, ventas_entregadas = excluded.ventas_entregadas,
      ganancias = excluded.ganancias, retiros = excluded.retiros, moneda = excluded.moneda, actualizado_en = now()
    returning 1
  )
  select count(*) into v_meses from ins;

  -- Por cobrar a Dropi en cada país: el último saldo de billetera registrado o, si no hay, ganancias − retiros.
  -- Solo en dólares (la cartera es en USD): Costa Rica queda en `fin_dropi_mensual`.
  select id into v_unidad from fin_unidades where nombre = 'CORPORATIVO' limit 1;
  for p in select pa.id, pa.codigo from paises pa where pa.codigo <> 'CR' and exists (select 1 from fin_dropi_mensual m where m.pais_id = pa.id) loop
    v_paises := v_paises + 1;
    select sw.monto into v_saldo from saldos_wallet sw
      join plataformas pl on pl.id = sw.plataforma_id
      where sw.pais_id = p.id and pl.nombre ilike 'dropi%' order by sw.fecha desc limit 1;
    if v_saldo is null then
      select coalesce(sum(ganancias), 0) - coalesce(sum(retiros), 0) into v_saldo from fin_dropi_mensual where pais_id = p.id;
    end if;
    if v_saldo > 0 then
      insert into fin_cartera (clase, contraparte, unidad_id, documento, fecha, motivo, monto, origen, origen_clave)
      values ('cobrar', 'Dropi', v_unidad, 'Billetera Dropi ' || p.codigo, current_date, 'Saldo de la billetera de Dropi por retirar', v_saldo, 'dropi', 'dropi-wallet|' || p.codigo)
      on conflict (origen_clave) do update set monto = excluded.monto, fecha = excluded.fecha, actualizado_en = now()
        where fin_cartera.editado_a_mano = false;
      v_docs := v_docs + 1;
    else
      delete from fin_cartera c where c.origen_clave = 'dropi-wallet|' || p.codigo and c.editado_a_mano = false
        and not exists (select 1 from fin_cartera_abonos a where a.documento_id = c.id);
    end if;
    v_saldo := null;
  end loop;
  return query select v_meses, v_paises, v_docs;
end;
$$;
revoke all on function fin_sincronizar_dropi() from public, anon, authenticated;

