-- 0967 · El costo de las órdenes de Shopify entra al EERR por canal (mejora 77), junto a sus ingresos (0964).
--
-- `fin_costos_desde_ordenes()` asienta como «COSTO DE VENTAS» el costo de lo entregado de cada tienda Shopify propia, un
-- movimiento por tienda y mes: origen `costo_ordenes_shopify`, llave `costo-ordenes|<unidad>|<AAAA-MM>`. El costo de cada
-- línea es el de `ven_lineas_costo` (costo vigente de Costos de mercancía o, si no hay, el de la Matriz).
--  · Mismas tiendas que los ingresos: canal «shopify» o conectada, nunca un cliente de fulfillment (0965).
--  · Nunca duplica: si la tienda y el mes ya traen costo de ventas de otro origen (Excel), no asienta y retira el suyo.
--  · Si alguna línea del mes no tiene costo, igual asienta lo que sí tiene y lo dice en la descripción.
--  · No toca meses cerrados. Idempotente.

create or replace function fin_costos_desde_ordenes()
returns table (asentados integer, omitidos integer, retirados integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tipo uuid;
  v_asentados integer := 0;
  v_omitidos integer := 0;
  v_retirados integer := 0;
begin
  select id into v_tipo from fin_tipos where nombre = 'COSTO DE VENTAS';
  if v_tipo is null then raise exception 'Falta el tipo «COSTO DE VENTAS» en el libro.'; end if;

  create temp table _cos on commit drop as
  select o.unidad_id, o.periodo, round(sum(coalesce(l.costo, 0)), 2) as costo,
         count(*) filter (where not l.es_servicio and l.costo is null) as sin_costo,
         'costo-ordenes|' || o.unidad_id::text || '|' || to_char(o.periodo, 'YYYY-MM') as clave
  from ven_ordenes o
  join ven_lineas_costo l on l.orden_id = o.id
  join fin_unidades u on u.id = o.unidad_id and u.clase = 'tienda' and not coalesce(u.cliente_fulfillment, false)
  where o.estado_entrega = 'entregada'
    and (u.canal = 'shopify' or exists (select 1 from ven_tiendas_conexion c where c.unidad_id = u.id and c.activo))
    and not exists (select 1 from fin_cierres f where f.periodo = o.periodo and f.estado = 'cerrado')
  group by o.unidad_id, o.periodo
  having sum(coalesce(l.costo, 0)) > 0;

  create temp table _otros on commit drop as
  select m.unidad_id, m.periodo from fin_movimientos m
  join fin_tipos t on t.id = m.tipo_id and t.seccion = 'costo_ventas'
  where m.origen is distinct from 'costo_ordenes_shopify'
  group by m.unidad_id, m.periodo;

  select count(*) into v_omitidos from _cos c where exists (select 1 from _otros e where e.unidad_id = c.unidad_id and e.periodo = c.periodo);

  with up as (
    insert into fin_movimientos (periodo, fecha_registro, unidad_id, tipo_id, descripcion, en_eerr, en_flujo, monto, origen, origen_clave)
    select c.periodo, c.periodo, c.unidad_id, v_tipo,
           'Costo de lo entregado en Shopify' || case when c.sin_costo > 0 then ' (' || c.sin_costo || ' líneas sin costo)' else '' end,
           true, false, c.costo, 'costo_ordenes_shopify', c.clave
    from _cos c
    where not exists (select 1 from _otros e where e.unidad_id = c.unidad_id and e.periodo = c.periodo)
    on conflict (origen_clave) do update set monto = excluded.monto, descripcion = excluded.descripcion, actualizado_en = now()
      where fin_movimientos.monto <> excluded.monto or fin_movimientos.descripcion <> excluded.descripcion
    returning 1
  )
  select count(*) into v_asentados from up;

  with del as (
    delete from fin_movimientos m
    where m.origen = 'costo_ordenes_shopify'
      and not exists (select 1 from fin_cierres f where f.periodo = m.periodo and f.estado = 'cerrado')
      and not exists (select 1 from conc_pares p where p.movimiento_id = m.id)
      and (
        not exists (select 1 from _cos c where c.clave = m.origen_clave)
        or exists (select 1 from _otros e where e.unidad_id = m.unidad_id and e.periodo = m.periodo)
      )
    returning 1
  )
  select count(*) into v_retirados from del;

  return query select v_asentados, v_omitidos, v_retirados;
end;
$$;
revoke all on function fin_costos_desde_ordenes() from public, anon, authenticated;
comment on function fin_costos_desde_ordenes() is 'Portal AF4 360°: asienta como COSTO DE VENTAS el costo de lo entregado en las tiendas Shopify propias, sin duplicar lo que trae el Excel.';
