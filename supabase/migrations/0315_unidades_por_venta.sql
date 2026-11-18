-- 0315 · Unidades por venta (18 nov 2026, pedido de Hernán): una variante de Shopify que es un paquete del mismo producto
-- («Paga 1 kit y lleva 2», «Lleva 3 kit», SKU «…/X3») se une a su producto con cuántas unidades lleva cada venta. Una línea de pedido con
-- cantidad 2 de un «Lleva 3» son 6 unidades: salen 6 de bodega y cuesta 6 veces el producto. Cuenta lo que recibe el cliente, no lo que paga.
--  · `tienda_variantes.unidades_por_venta`: lo elige quien vincula en Gestión de tienda › Tiendas Shopify › Productos (el sistema lo sugiere).
--  · `ven_orden_lineas.unidades_por_venta`: lo copia el sistema a las líneas de los pedidos junto con el producto (como `sku_maestro_id`).
--  · El costo de las líneas (`ven_lineas_costo`: Reportería y el costo de ventas del Estado de resultados) y el de Unidad económica
--    (`fin_ue_lineas`) multiplican por él. Con 1 (todo lo de antes) nada cambia.

alter table tienda_variantes add column if not exists unidades_por_venta integer not null default 1;
alter table ven_orden_lineas add column if not exists unidades_por_venta integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tienda_variantes_unidades_por_venta_check') then
    alter table tienda_variantes add constraint tienda_variantes_unidades_por_venta_check check (unidades_por_venta between 1 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ven_orden_lineas_unidades_por_venta_check') then
    alter table ven_orden_lineas add constraint ven_orden_lineas_unidades_por_venta_check check (unidades_por_venta between 1 and 100);
  end if;
end $$;

-- El costo de cada línea: cantidad × unidades por venta × costo vigente (lo de la Matriz, `costo_excel`, ya es el de la línea).
create or replace view ven_lineas_costo
with (security_invoker = true) as
select
  l.orden_id,
  o.periodo,
  o.unidad_id,
  o.estado_entrega,
  l.linea,
  l.producto,
  l.producto_clave,
  l.cantidad,
  l.es_servicio,
  l.costo_excel,
  coalesce(cm.producto_clave, cd.producto_clave) as costo_clave,
  coalesce(cm.costo_vigente, cd.costo_vigente) as costo_unitario,
  case
    when l.es_servicio then 0
    when coalesce(cm.costo_vigente, cd.costo_vigente) is not null then round(l.cantidad * l.unidades_por_venta * coalesce(cm.costo_vigente, cd.costo_vigente), 2)
    else l.costo_excel
  end as costo,
  case
    when l.es_servicio then 'servicio'
    when coalesce(cm.costo_vigente, cd.costo_vigente) is not null then 'costo_vigente'
    when l.costo_excel is not null then 'excel'
    else 'sin_costo'
  end as costo_fuente
from ven_orden_lineas l
join ven_ordenes o on o.id = l.orden_id
left join ven_productos_mapeo m on m.producto_clave = l.producto_clave
left join fin_costo_vigente cm on cm.producto_clave = m.costo_clave
left join fin_costo_vigente cd on cd.producto_clave = l.producto_clave;

-- Unidad económica (0934): la misma función, con el costo de la línea por las unidades por venta.
create or replace function fin_ue_lineas(p_desde date, p_hasta date, p_unidades uuid[] default null)
returns table (
  orden_id uuid,
  unidad_id uuid,
  periodo date,
  numero text,
  fecha date,
  estado_entrega text,
  metodo_pago text,
  transportista text,
  repartidor text,
  zona text,
  productos integer,
  producto_clave text,
  producto text,
  unidades numeric,
  peso numeric,
  enviada boolean,
  ventas numeric,
  mercancia numeric,
  envio numeric,
  envio_supuesto boolean,
  devolucion numeric,
  comision numeric,
  marketing numeric,
  margen numeric
)
language sql stable
set search_path = public
-- Con los meses como parámetro Postgres cree que vienen unas 300 órdenes y elige bucles anidados que con decenas de miles
-- tardan segundos; con uniones por hash es un orden de magnitud más rápido.
set enable_nestloop = off
as $$
with cfg as (
  select
    coalesce((v->>'envio_por_orden')::numeric, 0) as envio_orden,
    coalesce((v->>'envio_vuelta_factor')::numeric, 1) as vuelta,
    coalesce((v->>'perdida_devolucion_pct')::numeric, 0) / 100 as perdida,
    coalesce(v->'comision_pct', '{}'::jsonb) as comision
  from (select coalesce((select valor from fin_config where clave = 'unidad_economica'), '{}'::jsonb) as v) x
),
o as (
  select
    o.id, o.unidad_id, o.periodo, o.numero, o.fecha, o.estado_entrega, o.metodo_pago, o.total, o.costo_envio,
    nullif(btrim(o.transportista), '') as transportista,
    coalesce(nullif(btrim(r.nombre), ''), nullif(btrim(o.transportista), '')) as repartidor,
    coalesce(
      nullif(btrim(regexp_replace(translate(upper(c.corregimiento), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\s+', ' ', 'g')), ''),
      'SIN ZONA'
    ) as zona,
    o.estado_entrega in ('entregada', 'devuelta', 'en_transito') as enviada
  from ven_ordenes o
  left join ven_ordenes_clientes c on c.orden_id = o.id
  left join del_transportistas t on t.transportista = o.transportista
  left join del_repartidores r on r.id = t.repartidor_id
  where o.periodo >= date_trunc('month', p_desde)::date
    and o.periodo <= p_hasta
    and (p_unidades is null or o.unidad_id = any (p_unidades))
),
-- El costo de cada línea, con la misma regla de `ven_lineas_costo` (0122): costo vigente por el mapeo o por el mismo
-- nombre × cantidad; si no hay, el de la Matriz. Se arma aquí con el costo vigente leído una vez (por la vista, Postgres
-- lo recalculaba por cada línea).
cv as materialized (
  select producto_clave, costo_vigente from fin_costo_vigente
),
l as (
  select vl.orden_id,
    coalesce(cm.producto_clave, cd.producto_clave, vl.producto_clave) as producto_clave,
    vl.producto, vl.cantidad, vl.precio,
    case
      when coalesce(cm.costo_vigente, cd.costo_vigente) is not null then round(vl.cantidad * vl.unidades_por_venta * coalesce(cm.costo_vigente, cd.costo_vigente), 2)
      else vl.costo_excel
    end as costo
  from ven_orden_lineas vl
  join o on o.id = vl.orden_id
  left join ven_productos_mapeo m on m.producto_clave = vl.producto_clave
  left join cv cm on cm.producto_clave = m.costo_clave
  left join cv cd on cd.producto_clave = vl.producto_clave
  where not vl.es_servicio
),
lb as (
  select l.*,
    case
      when bool_and(l.precio is not null) over w then l.precio * l.cantidad
      when bool_and(coalesce(l.costo, 0) > 0) over w then l.costo
      else l.cantidad
    end as base,
    count(*) over w as n
  from l
  window w as (partition by l.orden_id)
),
lp as (
  select lb.*, coalesce(lb.base / nullif(sum(lb.base) over (partition by lb.orden_id), 0), 1.0 / lb.n) as peso
  from lb
),
x as (
  select
    o.*,
    coalesce(lp.n, 0)::integer as productos,
    coalesce(lp.producto_clave, '(sin producto)') as producto_clave,
    coalesce(lp.producto, '(sin producto)') as producto,
    coalesce(lp.cantidad, 0) as unidades,
    coalesce(lp.costo, 0) as costo,
    coalesce(lp.peso, 1) as peso,
    case
      when o.costo_envio > 0 then o.costo_envio
      when o.enviada then cfg.envio_orden
      else 0
    end as envio_orden,
    o.costo_envio = 0 and o.enviada and cfg.envio_orden > 0 as envio_supuesto,
    cfg.vuelta, cfg.perdida,
    coalesce((cfg.comision->>coalesce(o.metodo_pago, 'otro'))::numeric, 0) / 100 as tasa_comision
  from o
  cross join cfg
  left join lp on lp.orden_id = o.id
),
y as (
  select x.*,
    case when x.estado_entrega = 'entregada' then x.total * x.peso else 0 end as l_ventas,
    case when x.estado_entrega = 'entregada' then x.costo else 0 end as l_mercancia,
    x.envio_orden * x.peso as l_envio,
    case when x.estado_entrega = 'devuelta' then x.envio_orden * x.vuelta * x.peso + x.costo * x.perdida else 0 end as l_devolucion,
    case when x.estado_entrega = 'entregada' then x.total * x.peso * x.tasa_comision else 0 end as l_comision,
    -- Base de reparto del marketing: el valor de la orden (o su parte de una orden, si vale cero).
    coalesce(nullif(x.total, 0), 1) * x.peso as base_mkt
  from x
),
libro as (
  select r.periodo, r.unidad_id, r.marketing
  from fin_rentabilidad_libro r
  where r.periodo >= date_trunc('month', p_desde)::date and r.periodo <= p_hasta
),
camp as (
  select date_trunc('month', c.fecha)::date as periodo, c.unidad_id, c.producto_clave, sum(c.gasto) as gasto
  from mkt_meta_campanas c
  where c.unidad_id is not null
    and c.fecha >= date_trunc('month', p_desde)::date
    and c.fecha < (date_trunc('month', p_hasta) + interval '1 month')::date
  group by 1, 2, 3
),
tm as (
  select y.periodo, y.unidad_id, sum(y.base_mkt) as base
  from y group by 1, 2
),
tmp as (
  select y.periodo, y.unidad_id, y.producto_clave, sum(y.base_mkt) as base
  from y group by 1, 2, 3
),
mkt as (
  select tm.periodo, tm.unidad_id, tm.base,
    greatest(coalesce(lb.marketing, 0), coalesce((select sum(c.gasto) from camp c where c.periodo = tm.periodo and c.unidad_id = tm.unidad_id), 0))
      - coalesce((
          select sum(c.gasto) from camp c
          join tmp on tmp.periodo = c.periodo and tmp.unidad_id = c.unidad_id and tmp.producto_clave = c.producto_clave
          where c.periodo = tm.periodo and c.unidad_id = tm.unidad_id and c.producto_clave is not null
        ), 0) as resto
  from tm
  left join libro lb on lb.periodo = tm.periodo and lb.unidad_id = tm.unidad_id
),
z as (
  select y.*,
    coalesce(m.resto * y.base_mkt / nullif(m.base, 0), 0)
      + coalesce(cp.gasto * y.base_mkt / nullif(tmp.base, 0), 0) as l_marketing
  from y
  left join mkt m on m.periodo = y.periodo and m.unidad_id = y.unidad_id
  left join camp cp on cp.periodo = y.periodo and cp.unidad_id = y.unidad_id and cp.producto_clave = y.producto_clave
  left join tmp on tmp.periodo = y.periodo and tmp.unidad_id = y.unidad_id and tmp.producto_clave = y.producto_clave
)
select
  z.id, z.unidad_id, z.periodo, z.numero, z.fecha, z.estado_entrega, z.metodo_pago, z.transportista, z.repartidor, z.zona,
  z.productos, z.producto_clave, z.producto, z.unidades, round(z.peso, 6), z.enviada,
  round(z.l_ventas, 4), round(z.l_mercancia, 4), round(z.l_envio, 4), z.envio_supuesto, round(z.l_devolucion, 4),
  round(z.l_comision, 4), round(z.l_marketing, 4),
  round(z.l_ventas - z.l_mercancia - z.l_envio - z.l_devolucion - z.l_comision - z.l_marketing, 4)
from z
$$;
