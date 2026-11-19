-- 0988 · Ventas por tienda (lista de 100 mejoras, 19 nov 2026). Reversa: supabase/rollbacks/0988_rollback.sql.
--
-- Tres lecturas que suma Postgres para no traer miles de órdenes al portal:
-- 1. `ven_ventas_diarias`: pedidos, ventas (sin canceladas), entregadas y canceladas por día (proyección del mes, mejora 48).
-- 2. `ven_ventas_semana`: lo mismo por día de la semana (1 = lunes … 7 = domingo) y hora de Panamá (mejora 47). La hora
--    sale de `creado_origen` (cuando Shopify creó el pedido); lo que vino de la Matriz sin hora va con hora vacía.
-- 3. `ven_unidades_mes`: unidades de producto (sin servicios) por tienda y mes de los pedidos entregados (mejora 46).
-- Solo las ejecuta service_role (migración 0319: no hace falta grant). Se puede correr dos veces.

create or replace function ven_ventas_diarias(p_desde date, p_hasta date, p_unidades uuid[] default null)
returns table (fecha date, ordenes integer, ventas numeric, entregadas integer, canceladas integer)
language sql stable as $$
  select o.fecha,
    count(*)::integer,
    coalesce(sum(o.total) filter (where o.estado_entrega <> 'cancelada'), 0),
    (count(*) filter (where o.estado_entrega = 'entregada'))::integer,
    (count(*) filter (where o.estado_entrega = 'cancelada'))::integer
  from ven_ordenes o
  where o.fecha between p_desde and p_hasta
    and (p_unidades is null or o.unidad_id = any (p_unidades))
  group by o.fecha
  order by o.fecha;
$$;

create or replace function ven_ventas_semana(p_desde date, p_hasta date, p_unidades uuid[] default null)
returns table (dia integer, hora integer, ordenes integer, ventas numeric)
language sql stable as $$
  select extract(isodow from o.fecha)::integer,
    case when o.creado_origen is null then null else extract(hour from o.creado_origen at time zone 'America/Panama')::integer end,
    count(*)::integer,
    coalesce(sum(o.total), 0)
  from ven_ordenes o
  where o.fecha between p_desde and p_hasta
    and o.estado_entrega <> 'cancelada'
    and (p_unidades is null or o.unidad_id = any (p_unidades))
  group by 1, 2;
$$;

create or replace function ven_unidades_mes(p_desde date, p_hasta date, p_unidades uuid[] default null)
returns table (periodo date, unidad_id uuid, unidades numeric)
language sql stable as $$
  select o.periodo, o.unidad_id, coalesce(sum(l.cantidad), 0)
  from ven_ordenes o
  join ven_orden_lineas l on l.orden_id = o.id and not l.es_servicio
  where o.periodo between p_desde and p_hasta
    and o.estado_entrega = 'entregada'
    and (p_unidades is null or o.unidad_id = any (p_unidades))
  group by o.periodo, o.unidad_id;
$$;

