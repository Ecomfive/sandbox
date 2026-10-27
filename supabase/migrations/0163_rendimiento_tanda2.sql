-- Rendimiento, segunda tanda (27 oct 2026): las ventas de Dropi y las series de «Hoy» ya resumidas en la base, para no mandar miles de
-- filas por la red (y, en «Hoy», para que no se corten en 1000).
-- Gestión de IDs Dropi, Compras › Reponer y Ventas Dropi leían todas las ventas diarias del país (~19.000 filas en Panamá) y todo el
-- dinero (~17.000) para sumarlos en el servidor. Pero el detalle diario solo se usa en los últimos 90 días (netas de 30, 60 y 90 días y
-- la gráfica por día); de ahí para atrás solo cuenta el total de cada mes, y el dinero se usa solo por mes. Estas funciones devuelven
-- eso: los días recientes tal cual y lo anterior sumado por mes (con el día 1 del mes), así las cuentas dan exactamente lo mismo.
-- Código: src/lib/publicaciones/ventas-compactas.ts y src/lib/dashboard/queries.ts (si estas funciones no existen, se lee como antes).
-- Reversa: supabase/rollbacks/0163_rollback.sql

-- Ventas diarias: desde `p_desde` día por día; antes, una fila por producto y mes. Con `p_productos`, solo esos productos de Dropi.
create or replace function dropi_ventas_diarias_compactas(p_pais uuid, p_desde date, p_productos integer[] default null)
returns table (dropi_producto_id integer, dia date, pedidas bigint, ordenes bigint, canceladas bigint, rechazadas bigint, devueltas bigint)
language sql
stable
set search_path = public
as $$
  select v.dropi_producto_id, v.dia, v.pedidas::bigint, v.ordenes::bigint, v.canceladas::bigint, v.rechazadas::bigint, v.devueltas::bigint
    from dropi_ventas_diarias v
   where v.pais_id = p_pais and v.dia >= p_desde and (p_productos is null or v.dropi_producto_id = any (p_productos))
  union all
  select v.dropi_producto_id, date_trunc('month', v.dia)::date, sum(v.pedidas), sum(v.ordenes), sum(v.canceladas), sum(v.rechazadas), sum(v.devueltas)
    from dropi_ventas_diarias v
   where v.pais_id = p_pais and v.dia < p_desde and (p_productos is null or v.dropi_producto_id = any (p_productos))
   group by v.dropi_producto_id, date_trunc('month', v.dia)
  order by 1, 2
$$;

-- El dinero de Dropi: una fila por producto y mes (con el día 1 del mes).
create or replace function dropi_ventas_dinero_por_mes(p_pais uuid)
returns table (dropi_producto_id integer, dia date, entregadas bigint, unidades bigint, ganancia numeric, comision numeric, coste numeric, descuentos numeric)
language sql
stable
set search_path = public
as $$
  select d.dropi_producto_id, date_trunc('month', d.dia)::date, sum(d.entregadas), sum(d.unidades), sum(d.ganancia), sum(d.comision), sum(d.coste), sum(d.descuentos)
    from dropi_ventas_dinero d
   where d.pais_id = p_pais
   group by d.dropi_producto_id, date_trunc('month', d.dia)
   order by 1, 2
$$;

-- «Hoy» (pedido de Hernán, 27 oct 2026): las ventas y los movimientos de inventario de un período, sumados por día. Antes se pedían las
-- filas sin paginar y Supabase entrega como mucho 1000: en 30 días de Panamá había 9.436 órdenes y la gráfica sumaba solo 1.000.
create index if not exists ordenes_pais_fecha_idx on ordenes (pais_id, fecha);

create or replace function ordenes_por_dia(p_pais uuid, p_desde date, p_hasta date)
returns table (fecha date, monto numeric, ordenes bigint)
language sql
stable
set search_path = public
as $$
  select o.fecha, sum(o.monto), count(*)
    from ordenes o
   where o.pais_id = p_pais and o.fecha between p_desde and p_hasta
   group by o.fecha
   order by o.fecha
$$;

create or replace function movimientos_por_dia(p_pais uuid, p_desde date, p_hasta date)
returns table (fecha date, entradas numeric, salidas numeric)
language sql
stable
set search_path = public
as $$
  select m.fecha, sum(case when m.tipo = 'entrada' then m.cantidad else 0 end), sum(case when m.tipo = 'entrada' then 0 else m.cantidad end)
    from movimientos_inventario m
   where m.pais_id = p_pais and m.fecha between p_desde and p_hasta
   group by m.fecha
   order by m.fecha
$$;

analyze ordenes;

-- Solo el servidor (clave de servicio) las usa.
revoke all on function dropi_ventas_diarias_compactas(uuid, date, integer[]) from public, anon, authenticated;
revoke all on function dropi_ventas_dinero_por_mes(uuid) from public, anon, authenticated;
revoke all on function ordenes_por_dia(uuid, date, date) from public, anon, authenticated;
revoke all on function movimientos_por_dia(uuid, date, date) from public, anon, authenticated;
