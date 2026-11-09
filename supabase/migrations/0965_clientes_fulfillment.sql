-- 0965 · Clientes de fulfillment (Clicksi): sus órdenes no son ventas nuestras.
--
-- Clicksi no es una tienda de Ecomfive: se le proveen productos y se le hace el fulfillment (recibir la carga, guardar,
-- despachar y entregar). `fin_unidades.cliente_fulfillment` marca esas tiendas:
--  · `fin_ingresos_desde_ordenes()` no asienta sus órdenes como Ingresos (y retira lo que hubiera asentado).
--  · «Tiendas y proveeduría» no suma sus órdenes como ventas.
--  · Sus órdenes se siguen operando en el Pipeline (confirmar, despachar, entregar, cobrar), porque el fulfillment es nuestro.
-- Se puede correr dos veces.

alter table fin_unidades add column if not exists cliente_fulfillment boolean not null default false;
comment on column fin_unidades.cliente_fulfillment is 'Portal AF4 360°: la tienda es de un cliente al que solo se le da fulfillment (Clicksi); sus órdenes no son ventas de Ecomfive.';
update fin_unidades set cliente_fulfillment = true
where clase = 'tienda' and (canal = 'clicksi' or nombre ilike '%CLICKS%') and not cliente_fulfillment;

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
  join fin_unidades u on u.id = o.unidad_id and u.clase = 'tienda' and not u.cliente_fulfillment
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

comment on function fin_ingresos_desde_ordenes() is 'Portal AF4 360°: asienta como Ingresos las ventas entregadas de las tiendas Shopify propias (no las de clientes de fulfillment), sin duplicar lo que trae el Excel.';

-- Retira lo que ya se hubiera asentado de un cliente de fulfillment en meses abiertos.
delete from fin_movimientos m
using fin_unidades u
where m.origen = 'ordenes_shopify' and u.id = m.unidad_id and u.cliente_fulfillment
  and not exists (select 1 from conc_pares p where p.movimiento_id = m.id)
  and not exists (select 1 from fin_cierres f where f.periodo = m.periodo and f.estado = 'cerrado');
