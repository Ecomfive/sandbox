-- Portal AF4 360° — Comité de dirección (mejora 5): Panel financiero › Comité. Ver FINANZAS-360.md.
--
-- 1. ACTA DEL COMITÉ (`fin_comite_acta`): las decisiones de cada comité mensual con su responsable, la fecha comprometida,
--    el estado (pendiente / hecha) y el seguimiento que se escribe en el comité siguiente. Texto simple (se muestra como
--    texto, nunca como HTML).
-- 2. `fin_comite_tiendas_mes(desde, hasta, corte)`: por tienda y mes, lo que miran los indicadores del comité y el techo
--    de pauta (mejora 6): órdenes, enviadas, entregadas, devueltas y en tránsito de Ventas por tienda (`ven_ordenes`), el
--    valor de lo entregado y de lo que sigue en tránsito, los pedidos enviados hace más de 10 días sin estado final (a la
--    fecha de corte) y la pauta del mes: el marketing del libro por tienda (`fin_rentabilidad_libro`, A DISTRIBUIR ya
--    repartido) y el gasto de las campañas de Meta importadas (`mkt_meta_campanas`). Quien llama toma el mayor de los dos,
--    como la unidad económica (0147).
--
-- Las metas, el valor de partida y qué tiendas cuentan como «propias» viven en `fin_config` (clave `comite`); el techo de
-- pauta por tienda en `fin_config` (clave `techo_pauta`). No hacen falta tablas para eso.
--
-- RLS activado y sin políticas (SEGURIDAD.md): solo el servidor, con la clave de servicio. La función solo la llama el
-- servidor. Se puede correr dos veces.

create table if not exists fin_comite_acta (
  id uuid primary key default gen_random_uuid(),
  -- El mes del comité (primer día del mes que se revisa).
  periodo date not null check (extract(day from periodo) = 1),
  decision text not null check (length(btrim(decision)) between 1 and 1000),
  responsable text check (responsable is null or length(responsable) <= 120),
  fecha_compromiso date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha')),
  -- Lo que se dijo en el comité siguiente.
  seguimiento text check (seguimiento is null or length(seguimiento) <= 1000),
  hecha_en timestamptz,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);
create index if not exists fin_comite_acta_periodo on fin_comite_acta (periodo desc, creado_en);
create index if not exists fin_comite_acta_pendientes on fin_comite_acta (periodo) where estado = 'pendiente';
alter table fin_comite_acta enable row level security;

comment on table fin_comite_acta is 'Portal AF4 360°: decisiones del comité de dirección mensual, con responsable, estado y seguimiento.';

create or replace function fin_comite_tiendas_mes(p_desde date, p_hasta date, p_corte date default null)
returns table (
  periodo date,
  unidad_id uuid,
  ordenes bigint,
  enviadas bigint,
  entregadas bigint,
  devueltas bigint,
  en_transito bigint,
  ventas_entregadas numeric,
  ventas_transito numeric,
  elegibles_estado bigint,
  sin_estado bigint,
  marketing_libro numeric,
  gasto_meta numeric
)
language sql stable
set search_path = public
as $$
with c as (
  select coalesce(p_corte, (now() at time zone 'America/Panama')::date) as dia
),
o as (
  select
    v.periodo, v.unidad_id,
    count(*) as ordenes,
    count(*) filter (where v.estado_entrega in ('entregada', 'devuelta', 'en_transito')) as enviadas,
    count(*) filter (where v.estado_entrega = 'entregada') as entregadas,
    count(*) filter (where v.estado_entrega = 'devuelta') as devueltas,
    count(*) filter (where v.estado_entrega = 'en_transito') as en_transito,
    coalesce(sum(v.total) filter (where v.estado_entrega = 'entregada'), 0) as ventas_entregadas,
    coalesce(sum(v.total) filter (where v.estado_entrega = 'en_transito'), 0) as ventas_transito,
    -- Enviados hace más de 10 días (por la fecha de envío o, sin ella, la de la orden).
    count(*) filter (
      where (v.estado_entrega in ('entregada', 'devuelta', 'en_transito') or (v.estado_entrega = 'pendiente' and v.fecha_envio is not null))
        and coalesce(v.fecha_envio, v.fecha) <= c.dia - 10
    ) as elegibles_estado,
    -- …y todavía sin estado final (entregada, devuelta o cancelada).
    count(*) filter (
      where (v.estado_entrega = 'en_transito' or (v.estado_entrega = 'pendiente' and v.fecha_envio is not null))
        and coalesce(v.fecha_envio, v.fecha) <= c.dia - 10
    ) as sin_estado
  from ven_ordenes v
  cross join c
  where v.periodo >= date_trunc('month', p_desde)::date and v.periodo <= p_hasta
  group by v.periodo, v.unidad_id
),
lib as (
  select r.periodo, r.unidad_id, sum(r.marketing) as marketing
  from fin_rentabilidad_libro r
  where r.periodo >= date_trunc('month', p_desde)::date and r.periodo <= p_hasta
  group by r.periodo, r.unidad_id
),
camp as (
  select date_trunc('month', m.fecha)::date as periodo, m.unidad_id, sum(m.gasto) as gasto
  from mkt_meta_campanas m
  where m.unidad_id is not null
    and m.fecha >= date_trunc('month', p_desde)::date
    and m.fecha < (date_trunc('month', p_hasta) + interval '1 month')::date
  group by 1, 2
),
k as (
  select o.periodo, o.unidad_id from o
  union
  select lib.periodo, lib.unidad_id from lib
  union
  select camp.periodo, camp.unidad_id from camp
)
select
  k.periodo, k.unidad_id,
  coalesce(o.ordenes, 0), coalesce(o.enviadas, 0), coalesce(o.entregadas, 0), coalesce(o.devueltas, 0), coalesce(o.en_transito, 0),
  round(coalesce(o.ventas_entregadas, 0), 2), round(coalesce(o.ventas_transito, 0), 2),
  coalesce(o.elegibles_estado, 0), coalesce(o.sin_estado, 0),
  round(coalesce(lib.marketing, 0), 2), round(coalesce(camp.gasto, 0), 2)
from k
left join o on o.periodo = k.periodo and o.unidad_id = k.unidad_id
left join lib on lib.periodo = k.periodo and lib.unidad_id = k.unidad_id
left join camp on camp.periodo = k.periodo and camp.unidad_id = k.unidad_id
order by k.periodo, k.unidad_id
$$;

comment on function fin_comite_tiendas_mes(date, date, date) is 'Portal AF4 360°: por tienda y mes, entregas, pedidos sin estado y pauta (libro y Meta) para el comité de dirección y el techo de pauta.';

revoke all on function fin_comite_tiendas_mes(date, date, date) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_comite_tiendas_mes(date, date, date) from anon, authenticated';
  end if;
end $$;
