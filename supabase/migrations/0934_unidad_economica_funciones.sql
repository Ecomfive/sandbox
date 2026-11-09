-- Portal AF4 360°: Rentabilidad › unidad económica — las sumas, en Postgres (necesita 0122, 0128, 0130, 0133, 0134 y 0146).
--
--  * `fin_ue_lineas(desde, hasta, unidades)`: cada línea de producto de las órdenes de esos meses con su parte de la orden
--    (por precio si todas las líneas lo traen, si no por costo, si no por cantidad) y su margen real:
--      ventas (entregada) − mercancía (entregada) − envío (el costo real; si no tiene y se envió, el supuesto)
--      − devolución (devuelta: la vuelta = envío × factor, más el % del costo que se pierde) − comisión de cobro
--      (% del método de pago sobre lo cobrado) − marketing asignado.
--    Marketing de cada tienda y mes = el mayor entre el del libro (`fin_rentabilidad_libro`) y el de las campañas de Meta
--    asignadas; lo que una campaña asignó a un producto va a las líneas de ese producto y el resto se reparte por la
--    participación de cada línea en el valor de las órdenes del mes (entregadas o no: la publicidad compró la orden).
--    Una orden sin líneas de producto queda como una línea «(sin producto)».
--  * `fin_ue_agrupado(desde, hasta, unidades, por)`: las sumas por producto, zona (corregimiento), repartidor o
--    transportista, tienda, mes, método de pago, estado o tamaño de la orden (uno o varios productos).
--  * `fin_ue_pedidos(desde, hasta, unidades, limite, solo_perdida)`: las órdenes con su margen, de la que más pierde.
--  * `fin_ue_campanas(desde, hasta)` y `fin_ue_marketing_tienda(desde, hasta, unidades)`: gasto y compras de Meta por
--    campaña y por tienda, con el gasto de marketing del libro.
--
-- Solo las llama el servidor (clave de servicio). Se puede correr dos veces.

drop function if exists fin_ue_agrupado(date, date, uuid[], text);
drop function if exists fin_ue_pedidos(date, date, uuid[], integer, boolean);
drop function if exists fin_ue_lineas(date, date, uuid[]);

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
      when coalesce(cm.costo_vigente, cd.costo_vigente) is not null then round(vl.cantidad * coalesce(cm.costo_vigente, cd.costo_vigente), 2)
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

create or replace function fin_ue_agrupado(p_desde date, p_hasta date, p_unidades uuid[] default null, p_por text default 'producto')
returns table (
  clave text,
  etiqueta text,
  ordenes bigint,
  enviadas bigint,
  entregadas bigint,
  devueltas bigint,
  pierden bigint,
  envio_supuesto bigint,
  unidades_entregadas numeric,
  unidades_devueltas numeric,
  ventas numeric,
  mercancia numeric,
  envio numeric,
  envio_devueltas numeric,
  devolucion numeric,
  comision numeric,
  marketing numeric,
  margen numeric,
  meses bigint,
  perdida numeric
)
language sql stable
set search_path = public
as $$
with x as (
  select l.*, sum(l.margen) over (partition by l.orden_id) as margen_orden
  from fin_ue_lineas(p_desde, p_hasta, p_unidades) l
),
k as (
  select x.*,
    case p_por
      when 'producto' then x.producto_clave
      when 'zona' then x.zona
      when 'repartidor' then coalesce(x.repartidor, 'SIN TRANSPORTISTA')
      when 'tienda' then x.unidad_id::text
      when 'mes' then x.periodo::text
      when 'metodo' then coalesce(x.metodo_pago, 'otro')
      when 'estado' then x.estado_entrega
      when 'tamano' then case when x.productos > 1 then 'varios' else 'uno' end
      else 'todo'
    end as k_clave,
    case p_por
      when 'producto' then x.producto
      when 'zona' then x.zona
      when 'repartidor' then coalesce(x.repartidor, 'SIN TRANSPORTISTA')
      when 'tamano' then case when x.productos > 1 then 'Varios productos' else 'Un producto' end
      else null
    end as k_etiqueta
  from x
)
select
  k.k_clave,
  max(k.k_etiqueta),
  count(distinct k.orden_id),
  count(distinct k.orden_id) filter (where k.enviada),
  count(distinct k.orden_id) filter (where k.estado_entrega = 'entregada'),
  count(distinct k.orden_id) filter (where k.estado_entrega = 'devuelta'),
  count(distinct k.orden_id) filter (where k.margen_orden < 0),
  count(distinct k.orden_id) filter (where k.envio_supuesto),
  coalesce(sum(k.unidades) filter (where k.estado_entrega = 'entregada'), 0),
  coalesce(sum(k.unidades) filter (where k.estado_entrega = 'devuelta'), 0),
  round(sum(k.ventas), 2),
  round(sum(k.mercancia), 2),
  round(sum(k.envio), 2),
  round(coalesce(sum(k.envio) filter (where k.estado_entrega = 'devuelta'), 0), 2),
  round(sum(k.devolucion), 2),
  round(sum(k.comision), 2),
  round(sum(k.marketing), 2),
  round(sum(k.margen), 2),
  count(distinct k.periodo),
  round(coalesce(sum(k.margen) filter (where k.margen_orden < 0), 0), 2)
from k
group by k.k_clave
$$;

create or replace function fin_ue_pedidos(
  p_desde date, p_hasta date, p_unidades uuid[] default null, p_limite integer default 300, p_solo_perdida boolean default true
)
returns table (
  orden_id uuid,
  unidad_id uuid,
  numero text,
  fecha date,
  estado_entrega text,
  metodo_pago text,
  repartidor text,
  zona text,
  productos integer,
  producto text,
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
as $$
select
  l.orden_id, l.unidad_id, l.numero, l.fecha, l.estado_entrega, l.metodo_pago, max(l.repartidor), max(l.zona),
  max(l.productos), string_agg(l.producto, ' + ' order by l.peso desc),
  round(sum(l.ventas), 2), round(sum(l.mercancia), 2), round(sum(l.envio), 2), bool_or(l.envio_supuesto),
  round(sum(l.devolucion), 2), round(sum(l.comision), 2), round(sum(l.marketing), 2), round(sum(l.margen), 2)
from fin_ue_lineas(p_desde, p_hasta, p_unidades) l
group by l.orden_id, l.unidad_id, l.numero, l.fecha, l.estado_entrega, l.metodo_pago
having not p_solo_perdida or sum(l.margen) < 0
order by sum(l.margen), l.fecha desc
limit least(greatest(coalesce(p_limite, 300), 1), 2000)
$$;

create or replace function fin_ue_campanas(p_desde date, p_hasta date)
returns table (
  campana text,
  conjunto text,
  unidad_id uuid,
  producto_clave text,
  asignacion text,
  gasto numeric,
  compras numeric,
  desde date,
  hasta date,
  dias bigint
)
language sql stable
set search_path = public
as $$
select c.campana, c.conjunto, c.unidad_id, c.producto_clave, c.asignacion,
  round(sum(c.gasto), 2), round(sum(c.compras), 2), min(c.fecha), max(coalesce(c.fecha_fin, c.fecha)), count(distinct c.fecha)
from mkt_meta_campanas c
where c.fecha >= date_trunc('month', p_desde)::date
  and c.fecha < (date_trunc('month', p_hasta) + interval '1 month')::date
group by c.campana, c.conjunto, c.unidad_id, c.producto_clave, c.asignacion
order by sum(c.gasto) desc
$$;

create or replace function fin_ue_marketing_tienda(p_desde date, p_hasta date, p_unidades uuid[] default null)
returns table (
  unidad_id uuid,
  marketing_libro numeric,
  meta_libro numeric,
  gasto_campanas numeric,
  compras_campanas numeric,
  gasto_campanas_producto numeric
)
language sql stable
set search_path = public
as $$
with lib as (
  select r.unidad_id, sum(r.marketing) as marketing
  from fin_rentabilidad_libro r
  where r.periodo >= date_trunc('month', p_desde)::date and r.periodo <= p_hasta
  group by 1
),
meta as (
  select m.unidad_id, sum(m.gasto) as gasto
  from cli_marketing_mensual m
  where m.plataforma = 'meta' and m.periodo >= date_trunc('month', p_desde)::date and m.periodo <= p_hasta
  group by 1
),
camp as (
  select c.unidad_id, sum(c.gasto) as gasto, sum(c.compras) as compras,
    coalesce(sum(c.gasto) filter (where c.producto_clave is not null), 0) as gasto_producto
  from mkt_meta_campanas c
  where c.unidad_id is not null
    and c.fecha >= date_trunc('month', p_desde)::date
    and c.fecha < (date_trunc('month', p_hasta) + interval '1 month')::date
  group by 1
),
u as (select unidad_id from lib union select unidad_id from meta union select unidad_id from camp)
select u.unidad_id, round(coalesce(lib.marketing, 0), 2), round(coalesce(meta.gasto, 0), 2), round(coalesce(camp.gasto, 0), 2),
  round(coalesce(camp.compras, 0), 2), round(coalesce(camp.gasto_producto, 0), 2)
from u
left join lib on lib.unidad_id = u.unidad_id
left join meta on meta.unidad_id = u.unidad_id
left join camp on camp.unidad_id = u.unidad_id
where p_unidades is null or u.unidad_id = any (p_unidades)
$$;

comment on function fin_ue_lineas(date, date, uuid[]) is 'Portal AF4 360°: cada línea de producto con su margen real (envío, devolución, comisión y marketing asignado).';
comment on function fin_ue_agrupado(date, date, uuid[], text) is 'Portal AF4 360°: margen real sumado por producto, zona, repartidor, tienda, mes, método, estado o tamaño de la orden.';

revoke all on function fin_ue_lineas(date, date, uuid[]) from public;
revoke all on function fin_ue_agrupado(date, date, uuid[], text) from public;
revoke all on function fin_ue_pedidos(date, date, uuid[], integer, boolean) from public;
revoke all on function fin_ue_campanas(date, date) from public;
revoke all on function fin_ue_marketing_tienda(date, date, uuid[]) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_ue_lineas(date, date, uuid[]) from anon, authenticated';
    execute 'revoke all on function fin_ue_agrupado(date, date, uuid[], text) from anon, authenticated';
    execute 'revoke all on function fin_ue_pedidos(date, date, uuid[], integer, boolean) from anon, authenticated';
    execute 'revoke all on function fin_ue_campanas(date, date) from anon, authenticated';
    execute 'revoke all on function fin_ue_marketing_tienda(date, date, uuid[]) from anon, authenticated';
  end if;
end $$;
