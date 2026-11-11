-- 0964 · El EERR por canal se alimenta con las órdenes de Shopify.
--
-- `fin_ingresos_desde_ordenes()` asienta en el libro, como «Ingresos», lo vendido y entregado de cada tienda con
-- Shopify (conectada en el portal o con canal «shopify»), un movimiento por tienda y mes: origen `ordenes_shopify`,
-- llave `ordenes|<unidad>|<AAAA-MM>`. Se recalcula entero cada vez (idempotente).
--  · Solo cuenta la venta (`en_eerr`); el efectivo entra por la remesa y por el banco, así que `en_flujo = false`.
--  · No toca un mes cerrado en finanzas.
--  · Nunca duplica: si la tienda y el mes ya traen «Ingresos» de otro origen (el Excel), no asienta nada y retira el suyo.
--  · Si las órdenes del mes ya no suman, retira su movimiento.

create or replace function fin_ingresos_desde_ordenes()
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
  select id into v_tipo from fin_tipos where nombre = 'Ingresos';
  if v_tipo is null then raise exception 'Falta el tipo «Ingresos» en el libro.'; end if;

  create temp table _meta on commit drop as
  select o.unidad_id, o.periodo, sum(o.total) as ventas,
         'ordenes|' || o.unidad_id::text || '|' || to_char(o.periodo, 'YYYY-MM') as clave
  from ven_ordenes o
  join fin_unidades u on u.id = o.unidad_id and u.clase = 'tienda'
  where o.estado_entrega = 'entregada'
    and (u.canal = 'shopify' or exists (select 1 from ven_tiendas_conexion c where c.unidad_id = u.id and c.activo))
    and not exists (select 1 from fin_cierres f where f.periodo = o.periodo and f.estado = 'cerrado')
  group by o.unidad_id, o.periodo
  having sum(o.total) > 0;

  -- Lo que ya traen otras fuentes en el mismo mes: no se duplica.
  create temp table _excel on commit drop as
  select m.unidad_id, m.periodo from fin_movimientos m
  where m.tipo_id = v_tipo and m.origen <> 'ordenes_shopify'
  group by m.unidad_id, m.periodo;

  select count(*) into v_omitidos from _meta t where exists (select 1 from _excel e where e.unidad_id = t.unidad_id and e.periodo = t.periodo);

  with up as (
    insert into fin_movimientos (periodo, fecha_registro, unidad_id, tipo_id, descripcion, en_eerr, en_flujo, monto, origen, origen_clave)
    select t.periodo, t.periodo, t.unidad_id, v_tipo, 'Ventas entregadas de Shopify', true, false, round(t.ventas, 2), 'ordenes_shopify', t.clave
    from _meta t
    where not exists (select 1 from _excel e where e.unidad_id = t.unidad_id and e.periodo = t.periodo)
    on conflict (origen_clave) do update set monto = excluded.monto, actualizado_en = now()
      where fin_movimientos.monto <> excluded.monto
    returning 1
  )
  select count(*) into v_asentados from up;

  -- Retira los que ya no corresponden (sin ventas, con ingresos del Excel) en meses abiertos.
  with del as (
    delete from fin_movimientos m
    where m.origen = 'ordenes_shopify'
      and not exists (select 1 from fin_cierres f where f.periodo = m.periodo and f.estado = 'cerrado')
      and (
        not exists (select 1 from _meta t where t.clave = m.origen_clave)
        or exists (select 1 from _excel e where e.unidad_id = m.unidad_id and e.periodo = m.periodo)
      )
    returning 1
  )
  select count(*) into v_retirados from del;

  return query select v_asentados, v_omitidos, v_retirados;
end;
$$;
revoke all on function fin_ingresos_desde_ordenes() from public, anon, authenticated;

comment on function fin_ingresos_desde_ordenes() is 'Portal AF4 360°: asienta como Ingresos las ventas entregadas de las tiendas Shopify, sin duplicar lo que trae el Excel.';
