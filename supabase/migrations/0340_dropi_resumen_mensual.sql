-- Pedidos Dropi › Resumen (20 nov 2026, pedido de María José vía Hernán): la pestaña RESUMEN del sheet «ECOMFIVE DROPI 2026»
-- dentro del sistema, un mes por columna. Sale de lo que ya se lee de Dropi (cuenta proveedor): los pedidos (`ordenes`) y la
-- billetera (`historial_cartera`). Comprobado contra el sheet: la billetera de sept 2026 y la ganancia de entregados de ago 2026
-- dan igual al centavo, y los pedidos con comisión B280 de mar a sept dan los mismos (1.416, 2.098, 586, 336, 368, 470, 175).
--
-- 1. `ordenes.bodega_id` y `ordenes.guia`: la bodega de Dropi de la que sale el pedido (en Panamá, 81 = Proveedor Ecomfive y
--    280 = la bodega B280, que cobra US$1,50 por orden en cualquier estado) y su guía. Las llena el cargador de pedidos desde
--    ahora; aquí se completan con la copia en bruto que ya está guardada (`staging_ordenes_dropi`, desde el 17 sep 2026). Los
--    de la B280 de antes se completan aparte con una lectura de Dropi filtrada por esa bodega.
-- 2. `dropi_resumen_mensual(país, desde, hasta)`: por mes,
--    · pedidos del mes sin CANCELADO ni RECHAZADO, por estado, y esos dos aparte (por la fecha del pedido);
--    · ganancia: lo que Dropi acreditó por cada pedido del mes («ENTRADA POR GANANCIA», cruzado por el número de orden),
--      de los entregados y de los demás estados, y cuántos entregados todavía no tienen pago;
--    · pedidos de la bodega B280 (la comisión la multiplica la página);
--    · la billetera del mes (por la fecha del movimiento), con las mismas categorías del sheet: lo que es gasto (fletes y
--      devoluciones por garantía, indemnizaciones, otras salidas con guía, cobros sin guía como almacenamiento o stand) y lo
--      que no (pagos de ganancia, retiros, pagos internacionales, transferencias enviadas, otras entradas).
--    Solo lee; corre con los permisos de quien la llama y solo la ejecuta el servidor (0339).
-- Se puede correr dos veces. Reversa: supabase/rollbacks/0340_rollback.sql.

alter table ordenes add column if not exists bodega_id integer;
alter table ordenes add column if not exists guia text;
create index if not exists ordenes_bodega_idx on ordenes (pais_id, bodega_id) where bodega_id is not null;

comment on column ordenes.bodega_id is 'La bodega de Dropi de la que sale el pedido (warehouse_id). En Panamá 280 = B280 (comisión de US$1,50 por orden).';
comment on column ordenes.guia is 'La guía del pedido en Dropi (shipping_guide).';

-- Lo que ya está en la copia en bruto (la más reciente de cada pedido).
update ordenes o
set bodega_id = (s.payload->>'warehouse_id')::integer,
    guia = coalesce(o.guia, nullif(btrim(s.payload->>'shipping_guide'), ''))
from staging_ordenes_dropi s
join cuentas_extraccion ce on ce.id = s.cuenta_extraccion_id
where ce.pais_id = o.pais_id
  and ce.plataforma_id = o.plataforma_id
  and s.payload->>'id' = o.referencia_externa
  and o.bodega_id is null
  and (s.payload->>'warehouse_id') ~ '^[0-9]+$';

create or replace function dropi_resumen_mensual(p_pais uuid, p_desde date, p_hasta date)
returns table (
  periodo date,
  filas integer,
  pedidos integer,
  cancelados integer,
  rechazados integer,
  entregados integer,
  estados jsonb,
  ganancia_entregados numeric,
  ganancia_otros numeric,
  entregados_sin_pago integer,
  ordenes_b280 integer,
  sin_bodega integer,
  flete_garantia numeric,
  flete_recoleccion_garantia numeric,
  devolucion_garantia numeric,
  indemnizaciones numeric,
  otras_salidas_guia numeric,
  otros_cobros_sin_guia numeric,
  pagos_ganancia numeric,
  retiros numeric,
  pagos_internacionales numeric,
  transferencias_enviadas numeric,
  otras_entradas numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with dropi as (select id from plataformas where nombre = 'Dropi'),
  rango as (
    select date_trunc('month', p_desde)::date as desde, (date_trunc('month', p_hasta) + interval '1 month')::date as hasta
  ),
  meses as (
    select generate_series((select desde from rango), (select hasta from rango) - 1, interval '1 month')::date as periodo
  ),
  o as (
    select date_trunc('month', x.fecha)::date as periodo, x.referencia_externa, upper(btrim(x.estado)) as estado, x.bodega_id
    from ordenes x
    where x.pais_id = p_pais and x.plataforma_id = (select id from dropi)
      and x.fecha >= (select desde from rango) and x.fecha < (select hasta from rango)
  ),
  gan as (
    select c.orden_referencia_externa as ref, sum(abs(c.monto)) as ganancia
    from historial_cartera c
    where c.pais_id = p_pais and c.plataforma_id = (select id from dropi)
      and upper(c.descripcion) like 'ENTRADA POR GANANCIA%'
      and c.orden_referencia_externa in (select referencia_externa from o)
    group by 1
  ),
  po as (
    select o.periodo,
      count(*)::integer as filas,
      (count(*) filter (where o.estado not in ('CANCELADO', 'RECHAZADO')))::integer as pedidos,
      (count(*) filter (where o.estado = 'CANCELADO'))::integer as cancelados,
      (count(*) filter (where o.estado = 'RECHAZADO'))::integer as rechazados,
      (count(*) filter (where o.estado = 'ENTREGADO'))::integer as entregados,
      coalesce(sum(g.ganancia) filter (where o.estado = 'ENTREGADO'), 0) as ganancia_entregados,
      coalesce(sum(g.ganancia) filter (where o.estado <> 'ENTREGADO'), 0) as ganancia_otros,
      (count(*) filter (where o.estado = 'ENTREGADO' and g.ref is null))::integer as entregados_sin_pago,
      (count(*) filter (where o.bodega_id = 280))::integer as ordenes_b280,
      (count(*) filter (where o.bodega_id is null))::integer as sin_bodega
    from o
    left join gan g on g.ref = o.referencia_externa
    group by o.periodo
  ),
  pe as (
    select e.periodo, jsonb_object_agg(e.estado, e.n) as estados
    from (
      select o.periodo, o.estado, count(*)::integer as n
      from o
      where o.estado not in ('CANCELADO', 'RECHAZADO')
      group by 1, 2
    ) e
    group by e.periodo
  ),
  w as (
    select date_trunc('month', c.fecha)::date as periodo,
      case
        when upper(c.descripcion) like 'ENTRADA POR GANANCIA%' then 'pagos_ganancia'
        when upper(c.descripcion) like 'COBRO DE FLETE POR RECOLECCION DE GARANTIA%' then 'flete_recoleccion_garantia'
        when upper(c.descripcion) like 'COBRO DE FLETE POR ORDEN%GARANTIA%' then 'flete_garantia'
        when upper(c.descripcion) like 'COBRO DE DEVOLUCION DE DINERO%' then 'devolucion_garantia'
        when upper(c.descripcion) like '%INDEMNIZACION%' then 'indemnizaciones'
        when upper(c.descripcion) like 'SALIDA POR PETICION DE RETIRO%' then 'retiros'
        when upper(c.descripcion) like 'RET% ADMIN%PAGO INTERNACIONAL%' then 'pagos_internacionales'
        when upper(c.descripcion) like 'SALIDA POR TRANSFERENCIA DE WALLET%' then 'transferencias_enviadas'
        when upper(c.tipo) = 'SALIDA' and c.orden_referencia_externa is not null then 'otras_salidas_guia'
        when upper(c.tipo) = 'SALIDA' then 'otros_cobros_sin_guia'
        else 'otras_entradas'
      end as categoria,
      abs(c.monto) as monto
    from historial_cartera c
    where c.pais_id = p_pais and c.plataforma_id = (select id from dropi)
      and c.fecha >= (select desde from rango) and c.fecha < (select hasta from rango)
  ),
  ws as (
    select w.periodo,
      coalesce(sum(w.monto) filter (where w.categoria = 'flete_garantia'), 0) as flete_garantia,
      coalesce(sum(w.monto) filter (where w.categoria = 'flete_recoleccion_garantia'), 0) as flete_recoleccion_garantia,
      coalesce(sum(w.monto) filter (where w.categoria = 'devolucion_garantia'), 0) as devolucion_garantia,
      coalesce(sum(w.monto) filter (where w.categoria = 'indemnizaciones'), 0) as indemnizaciones,
      coalesce(sum(w.monto) filter (where w.categoria = 'otras_salidas_guia'), 0) as otras_salidas_guia,
      coalesce(sum(w.monto) filter (where w.categoria = 'otros_cobros_sin_guia'), 0) as otros_cobros_sin_guia,
      coalesce(sum(w.monto) filter (where w.categoria = 'pagos_ganancia'), 0) as pagos_ganancia,
      coalesce(sum(w.monto) filter (where w.categoria = 'retiros'), 0) as retiros,
      coalesce(sum(w.monto) filter (where w.categoria = 'pagos_internacionales'), 0) as pagos_internacionales,
      coalesce(sum(w.monto) filter (where w.categoria = 'transferencias_enviadas'), 0) as transferencias_enviadas,
      coalesce(sum(w.monto) filter (where w.categoria = 'otras_entradas'), 0) as otras_entradas
    from w
    group by w.periodo
  )
  select m.periodo,
    coalesce(po.filas, 0), coalesce(po.pedidos, 0), coalesce(po.cancelados, 0), coalesce(po.rechazados, 0), coalesce(po.entregados, 0),
    coalesce(pe.estados, '{}'::jsonb),
    round(coalesce(po.ganancia_entregados, 0), 2), round(coalesce(po.ganancia_otros, 0), 2), coalesce(po.entregados_sin_pago, 0),
    coalesce(po.ordenes_b280, 0), coalesce(po.sin_bodega, 0),
    round(coalesce(ws.flete_garantia, 0), 2), round(coalesce(ws.flete_recoleccion_garantia, 0), 2), round(coalesce(ws.devolucion_garantia, 0), 2),
    round(coalesce(ws.indemnizaciones, 0), 2), round(coalesce(ws.otras_salidas_guia, 0), 2), round(coalesce(ws.otros_cobros_sin_guia, 0), 2),
    round(coalesce(ws.pagos_ganancia, 0), 2), round(coalesce(ws.retiros, 0), 2), round(coalesce(ws.pagos_internacionales, 0), 2),
    round(coalesce(ws.transferencias_enviadas, 0), 2), round(coalesce(ws.otras_entradas, 0), 2)
  from meses m
  left join po on po.periodo = m.periodo
  left join pe on pe.periodo = m.periodo
  left join ws on ws.periodo = m.periodo
  order by m.periodo;
$$;

revoke execute on function dropi_resumen_mensual(uuid, date, date) from public, anon, authenticated;
grant execute on function dropi_resumen_mensual(uuid, date, date) to service_role;

-- El módulo de la pestaña: para quien ya abre Ventas por tienda (Finanzas); solo lectura si allí es de solo lectura.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select pr.rol_id, 'pedidos-dropi-resumen', pr.solo_lectura
from permisos_rol pr
where pr.modulo = 'ventas-tiendas'
on conflict (rol_id, modulo) do nothing;

notify pgrst, 'reload schema';

-- Revisión (solo lee): columnas = 2, funcion = 1, anon_puede = false y con_bodega > 0 (los pedidos desde el 17 sep 2026).
select
  (select count(*) from information_schema.columns where table_name = 'ordenes' and column_name in ('bodega_id', 'guia')) as columnas,
  (select count(*) from pg_proc where proname = 'dropi_resumen_mensual') as funcion,
  has_function_privilege('anon', 'dropi_resumen_mensual(uuid,date,date)', 'execute')::text as anon_puede,
  (select count(*) from ordenes where bodega_id is not null) as con_bodega;
