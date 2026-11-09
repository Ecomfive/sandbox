-- Portal AF4 360° — Planificación: las sumas de la historia, en Postgres (necesita 0122, 0146, 0147 y 0157).
--
--  * `fin_plan_historia(desde, hasta, unidades)`: por tienda y mes, los pedidos no cancelados y su valor (de
--    `ven_ordenes`) y lo entregado, la mercancía, el envío, la devolución, la comisión y el marketing asignado (de
--    `fin_ue_lineas`, la misma regla de Rentabilidad). Es la base de los motores, del pronóstico y de las metas.
--  * `fin_plan_dias_semana(desde, hasta, unidades)`: el valor de los pedidos no cancelados por tienda y día de la semana
--    (0 = domingo), para el efecto calendario del pronóstico.
--
-- Solo las llama el servidor (clave de servicio). Se puede correr dos veces.

create or replace function fin_plan_historia(p_desde date, p_hasta date, p_unidades uuid[] default null)
returns table (
  unidad_id uuid,
  periodo date,
  pedidos bigint,
  ventas numeric,
  entregado numeric,
  mercancia numeric,
  envio numeric,
  devolucion numeric,
  comision numeric,
  marketing numeric
)
language sql stable
set search_path = public
set enable_nestloop = off
as $$
with o as (
  select o.unidad_id, o.periodo, count(*) as pedidos, sum(o.total) as ventas
  from ven_ordenes o
  where o.periodo >= date_trunc('month', p_desde)::date
    and o.periodo <= p_hasta
    and o.estado_entrega <> 'cancelada'
    and (p_unidades is null or o.unidad_id = any (p_unidades))
  group by 1, 2
),
u as (
  select l.unidad_id, l.periodo,
    sum(l.ventas) as entregado, sum(l.mercancia) as mercancia, sum(l.envio) as envio, sum(l.devolucion) as devolucion,
    sum(l.comision) as comision, sum(l.marketing) as marketing
  from fin_ue_lineas(p_desde, p_hasta, p_unidades) l
  group by 1, 2
)
select
  coalesce(o.unidad_id, u.unidad_id), coalesce(o.periodo, u.periodo),
  coalesce(o.pedidos, 0), round(coalesce(o.ventas, 0), 2), round(coalesce(u.entregado, 0), 2), round(coalesce(u.mercancia, 0), 2),
  round(coalesce(u.envio, 0), 2), round(coalesce(u.devolucion, 0), 2), round(coalesce(u.comision, 0), 2), round(coalesce(u.marketing, 0), 2)
from o
full join u on u.unidad_id = o.unidad_id and u.periodo = o.periodo
$$;

create or replace function fin_plan_dias_semana(p_desde date, p_hasta date, p_unidades uuid[] default null)
returns table (unidad_id uuid, dia integer, ventas numeric)
language sql stable
set search_path = public
as $$
select o.unidad_id, extract(dow from o.fecha)::integer, round(sum(o.total), 2)
from ven_ordenes o
where o.fecha >= p_desde
  and o.fecha <= p_hasta
  and o.estado_entrega <> 'cancelada'
  and (p_unidades is null or o.unidad_id = any (p_unidades))
group by 1, 2
$$;
