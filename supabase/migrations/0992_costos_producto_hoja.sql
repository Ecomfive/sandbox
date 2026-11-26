-- 0992 · Costos de producto: la hoja única de costos de Panamá (pedido de María José, Oceans, 26 nov 2026; documento
-- «Costos de producto — mapa de seguimiento»). Reversa: supabase/rollbacks/0992_rollback.sql. Se puede correr dos veces.
--
-- Una fila por compra y producto, agrupada por el código único del producto (`skus_maestros.numero`, «#0088»):
--  · Entra sola cuando una compra de Panamá pasa a «En Bodega» o «08 - Completado» (la sincroniza el sistema con lo que
--    ya tiene Producto/Compras: código ECOM, unidades, costo unitario, fecha de llegada y financiamiento por OC).
--  · María José y Francis llenan los costos asociados (totales de esa compra, en USD): comisión bancaria del pago 1 y del
--    pago 2, comisión de cambio, impuestos y aduana, envío y desaduanaje, y otros. El % variable por financiamiento y el
--    costo total unitario los calcula el disparador `fin_costos_hoja_calcular`, nunca se escriben a mano.
--  · `costo_final_manual` (opcional) reemplaza el cálculo: la carga inicial trae el costo final del Excel de María José.
--  · Las filas viejas (Excel histórico, origen distinto) quedan con `en_hoja_costos = false`: siguen como historial y no
--    salen en la hoja.
--
-- Regla del costo de venta (decidida por Alex, 26 nov 2026): cada línea vendida toma el costo total unitario de la última
-- compra del producto que llegó en o antes de la fecha del pedido (`fin_costo_hoja_en`). Una compra nueva no cambia el
-- costo de lo ya vendido; un pedido anterior a la primera compra cargada toma la primera. Packs y combos suman sus
-- componentes; una variante sin compras propias toma la de su producto principal.

alter table fin_costos_lotes
  add column if not exists en_hoja_costos boolean not null default false,
  add column if not exists compra_id uuid references wms_compras(id) on delete set null,
  add column if not exists asoc_comision_banco_1 numeric(14, 2) not null default 0,
  add column if not exists asoc_comision_banco_2 numeric(14, 2) not null default 0,
  add column if not exists asoc_comision_cambio numeric(14, 2) not null default 0,
  add column if not exists asoc_impuesto numeric(14, 2) not null default 0,
  add column if not exists asoc_envio numeric(14, 2) not null default 0,
  add column if not exists asoc_otros numeric(14, 2) not null default 0,
  add column if not exists asoc_nota text,
  add column if not exists costo_final_manual numeric(14, 6),
  add column if not exists costos_por uuid references auth.users(id) on delete set null,
  add column if not exists costos_por_nombre text,
  add column if not exists costos_en timestamptz,
  -- Lo que vino del Excel de la carga inicial (falta desglosarlo en costos asociados).
  add column if not exists costo_final_excel boolean not null default false,
  -- Unidades pedidas cuando Recepción anotó otra cantidad: el costo por unidad se divide por lo recibido.
  add column if not exists cantidad_pedida numeric(14, 2),
  -- De dónde sale el financiamiento: cobrado por el financista, estimado (congelado al llegar la compra) o ninguno.
  add column if not exists financiamiento_tipo text,
  add column if not exists financiamiento_fijado_en date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_costos_lotes_financiamiento_tipo') then
    alter table fin_costos_lotes add constraint fin_costos_lotes_financiamiento_tipo
      check (financiamiento_tipo is null or financiamiento_tipo in ('real', 'estimado', 'ninguno'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_costos_lotes_asoc_positivos') then
    alter table fin_costos_lotes add constraint fin_costos_lotes_asoc_positivos check (
      asoc_comision_banco_1 >= 0 and asoc_comision_banco_2 >= 0 and asoc_comision_cambio >= 0
      and asoc_impuesto >= 0 and asoc_envio >= 0 and asoc_otros >= 0
      and (costo_final_manual is null or costo_final_manual > 0)
    );
  end if;
end $$;

create index if not exists fin_costos_lotes_hoja_sku on fin_costos_lotes (sku_maestro_id, fecha_llegada desc) where en_hoja_costos;
create index if not exists fin_costos_lotes_compra on fin_costos_lotes (compra_id) where compra_id is not null;

-- El costo por unidad de cada fila de la hoja: costo de compra + asociados ÷ unidades + financiamiento por unidad, o el
-- costo final manual si lo tiene. `comisiones` junta los bancarios, el de cambio y otros; `impuesto` y `envio` los suyos.
create or replace function fin_costos_hoja_calcular() returns trigger
language plpgsql
set search_path = public
as $$
declare
  q numeric := nullif(new.cantidad, 0);
begin
  if not new.en_hoja_costos then return new; end if;
  new.comisiones := case when q is null then 0 else round((new.asoc_comision_banco_1 + new.asoc_comision_banco_2 + new.asoc_comision_cambio + new.asoc_otros) / q, 6) end;
  new.impuesto := case when q is null then 0 else round(new.asoc_impuesto / q, 6) end;
  new.envio := case when q is null then 0 else round(new.asoc_envio / q, 6) end;
  new.costo_total := coalesce(new.costo_final_manual, round(new.costo_unitario + new.comisiones + new.impuesto + new.envio + new.financiamiento, 6));
  return new;
end;
$$;

drop trigger if exists fin_costos_hoja_calcular on fin_costos_lotes;
create trigger fin_costos_hoja_calcular before insert or update on fin_costos_lotes
  for each row execute function fin_costos_hoja_calcular();

-- El costo total unitario que vale para un producto en una fecha (regla de arriba).
create or replace function fin_costo_hoja_en(p_sku uuid, p_fecha date, p_nivel integer default 0)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  f date := coalesce(p_fecha, (now() at time zone 'America/Panama')::date);
  v numeric;
  faltan integer;
  padre uuid;
begin
  if p_sku is null or p_nivel > 2 then return null; end if;
  select l.costo_total into v
  from fin_costos_lotes l
  where l.en_hoja_costos and l.sku_maestro_id = p_sku
  order by (l.fecha_llegada is not null and l.fecha_llegada <= f) desc,
           case when l.fecha_llegada <= f then l.fecha_llegada end desc nulls last,
           l.fecha_llegada asc nulls last,
           l.creado_en desc
  limit 1;
  if v is not null then return v; end if;

  -- Pack o combo: la suma de sus componentes (si a uno le falta el costo, el pack queda sin costo).
  if exists (select 1 from sku_maestro_componentes where combo_id = p_sku) then
    select sum(c.cantidad * fin_costo_hoja_en(c.componente_id, f, p_nivel + 1)),
           count(*) filter (where fin_costo_hoja_en(c.componente_id, f, p_nivel + 1) is null)
      into v, faltan
    from sku_maestro_componentes c where c.combo_id = p_sku;
    return case when faltan = 0 then round(v, 6) end;
  end if;

  -- Variante sin compras propias: la de su producto principal.
  select s.padre_id into padre from skus_maestros s where s.id = p_sku;
  if padre is not null then return fin_costo_hoja_en(padre, f, p_nivel + 1); end if;
  return null;
end;
$$;
revoke all on function fin_costo_hoja_en(uuid, date, integer) from public, anon, authenticated;
comment on function fin_costo_hoja_en(uuid, date, integer) is 'Costos de producto (0992): costo total unitario de la última compra llegada en o antes de la fecha.';

-- El producto de una línea de pedido: el unido por el sistema o, si no, el que trae el SKU como código único («#0088»,
-- «0088») o como SKU del producto.
create or replace function fin_producto_de_linea(p_sku_id uuid, p_sku text)
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    p_sku_id,
    (select s.id from skus_maestros s
      where btrim(coalesce(p_sku, '')) ~ '^#?[0-9]{1,6}$' and s.numero = nullif(regexp_replace(p_sku, '[^0-9]', '', 'g'), '')::bigint
      limit 1),
    (select s.id from skus_maestros s where upper(btrim(s.codigo)) = upper(btrim(p_sku)) and btrim(coalesce(p_sku, '')) <> '' limit 1)
  );
$$;
revoke all on function fin_producto_de_linea(uuid, text) from public, anon, authenticated;

-- La reportería de pedidos y el costo de ventas del Estado de resultados (`fin_costos_desde_ordenes`) toman primero el
-- costo de la hoja por producto y fecha del pedido; si el producto no está en la hoja, lo de siempre (costo vigente por
-- nombre o el de la Matriz). Las columnas de 0317 y, al final, `costo_hoja` (el unitario de la hoja, si lo hay).
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
  coalesce(h.costo, cm.costo_vigente, cd.costo_vigente)::numeric(14, 6) as costo_unitario,
  case
    when l.es_servicio then 0
    when coalesce(h.costo, cm.costo_vigente, cd.costo_vigente) is not null then round(l.cantidad * coalesce(h.costo, cm.costo_vigente, cd.costo_vigente), 2)
    else l.costo_excel
  end as costo,
  case
    when l.es_servicio then 'servicio'
    when coalesce(h.costo, cm.costo_vigente, cd.costo_vigente) is not null then 'costo_vigente'
    when l.costo_excel is not null then 'excel'
    else 'sin_costo'
  end as costo_fuente,
  h.costo::numeric(14, 6) as costo_hoja
from ven_orden_lineas l
join ven_ordenes o on o.id = l.orden_id
left join lateral (
  select fin_costo_hoja_en(fin_producto_de_linea(l.sku_maestro_id, l.sku), o.fecha) as costo
  where not l.es_servicio
) h on true
left join ven_productos_mapeo m on m.producto_clave = l.producto_clave
left join fin_costo_vigente cm on cm.producto_clave = m.costo_clave
left join fin_costo_vigente cd on cd.producto_clave = l.producto_clave;

-- Unidad económica (Rentabilidad, planificación, precio de transferencia): la misma regla que la reportería y el Estado de
-- resultados. Es la definición de 0934/0317 con el costo de la hoja primero.
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
-- El costo de cada línea, con la misma regla de `ven_lineas_costo` (0992: primero la hoja de Costos de producto; 0122): costo vigente por el mapeo o por el mismo
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
      when h.costo is not null then round(vl.cantidad * h.costo, 2)
      when coalesce(cm.costo_vigente, cd.costo_vigente) is not null then round(vl.cantidad * coalesce(cm.costo_vigente, cd.costo_vigente), 2)
      else vl.costo_excel
    end as costo
  from ven_orden_lineas vl
  join o on o.id = vl.orden_id
  -- 0992: primero el costo de la hoja de Costos de producto (última compra llegada en o antes de la fecha del pedido).
  left join lateral (select fin_costo_hoja_en(fin_producto_de_linea(vl.sku_maestro_id, vl.sku), o.fecha) as costo) h on true
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


-- Las compras del cálculo de antes (mejora 31: toda compra llegada de cualquier etapa) dejan su lugar a la hoja; la
-- sincronización vuelve a crear, como filas de la hoja, las de Panamá que están En Bodega o Completado.
delete from fin_costos_lotes where origen = 'compras' and not en_hoja_costos;

-- Carga inicial: los productos que hoy tienen stock en Panamá con sus compras, del Excel que revisó técnica
-- («Compras_con_stock_Panama_costo_final_26nov.xlsx»). El costo final del Excel queda como `costo_final_manual`; el costo
-- de compra sale de la compra (o, si no hay, del mismo costo final). Si la compra existe, la fila usa su misma llave que
-- la sincronización (`compra:<compra>:<producto>`) y nunca se duplica. Lo que ya estaba en la hoja no se pisa.
with v(numero, ecom, oc, unidades, llegada, final, clave) as (values
  (1, 'ECOM01-0144', 'OC-0365', 1000, date '2026-02-20', 1.43, '15 DAYS CLEANSE 30 CAPSULAS'),
  (2, 'ECOM01-0361', 'OC-0785', 500, date '2026-07-30', 3.45, 'ADEUS TRATAMIENTO INTENSIVO PARA LA PIEL'),
  (3, 'PA-00147', 'OC-0157', 930, date '2025-04-28', 1.075269, 'ACEITE CORPORAL MAGIC'),
  (3, 'ECOM01-0110', 'OC-0335', 500, date '2026-01-22', 1.1, 'ACEITE CORPORAL MAGIC'),
  (4, 'PA-00144', 'OC-0153', 1000, date '2025-04-28', 0.92, 'ACEITE GOTAS PARA HONGOS FUNGUS FREE NAIL'),
  (4, 'PA-00179', 'OC-0201', 1000, date '2025-09-01', 0.9, 'ACEITE GOTAS PARA HONGOS FUNGUS FREE NAIL'),
  (4, 'ECOM01-0111', 'OC-0332', 1000, date '2026-01-22', 0.86, 'ACEITE GOTAS PARA HONGOS FUNGUS FREE NAIL'),
  (4, 'ECOM01-0236', 'OC-0516', 1000, date '2026-05-05', 0.9, 'ACEITE GOTAS PARA HONGOS FUNGUS FREE NAIL'),
  (4, 'ECOM01-0286', 'OC-0616', 1000, date '2026-05-27', 0.88, 'ACEITE GOTAS PARA HONGOS FUNGUS FREE NAIL'),
  (5, 'ECOM01-0365', 'OC-0780', 1020, date '2026-07-30', 1.27, 'ACEITE REMOVEDOR DE VELLOS CYPERUS'),
  (6, 'PA-00164', 'OC-0177', 100, date '2025-06-18', 2.36, 'ACEITE VEGANIC OIL'),
  (6, 'PA-00178', 'OC-0203', 500, date '2025-09-01', 1.68, 'ACEITE VEGANIC OIL'),
  (6, 'ECOM01-0288', 'OC-0615', 280, date '2026-05-27', 1.47, 'ACEITE VEGANIC OIL'),
  (7, 'None', 'OC-0159', 500, date '2025-02-21', 2.33, 'ACEITE DE BATANA Y ROMERO 30ML'),
  (7, 'ECOM01-0028', 'OC-0279', 1000, date '2025-11-18', 2.03, 'ACEITE DE BATANA Y ROMERO 30ML'),
  (7, 'ECOM01-0127', 'OC-0314', 1000, date '2026-02-06', 2.04, 'ACEITE DE BATANA Y ROMERO 30ML'),
  (7, 'ECOM01-0377', 'OC-0805', 960, date '2026-09-25', 1.854167, 'ACEITE DE BATANA Y ROMERO 30ML'),
  (484, 'ECOM01-0437', 'OC-0918', 2021, date '2026-10-31', 2.24, 'ACEITE DE MASAJE ANTICELULITICO M3 NATURALS ANTI CELLULITE MASSAGE OIL 240 ML'),
  (1353, 'ECOM01-0153', 'OC-0382', 1000, date '2026-02-20', 2.43, 'ACEITE DE OREGANO 180SG BLANCO OIL OF OREGANO WITH BLACK SEED OIL'),
  (1353, 'ECOM01-0232', 'OC-0530', 1000, date '2026-05-05', 2.51, 'ACEITE DE OREGANO 180SG BLANCO OIL OF OREGANO WITH BLACK SEED OIL'),
  (1353, 'ECOM01-0324', 'OC-0689', 1000, date '2026-06-18', 2.49, 'ACEITE DE OREGANO 180SG BLANCO OIL OF OREGANO WITH BLACK SEED OIL'),
  (1340, 'ECOM01-0152', 'OC-0378', 1000, date '2026-02-20', 3.2, 'ACEITE DE OREGANO 300SG BLANCO OIL OF OREGANO WITH BLACK SEED OIL'),
  (1340, 'ECOM01-0271', 'OC-0586', 1000, date '2026-05-19', 3.24, 'ACEITE DE OREGANO 300SG BLANCO OIL OF OREGANO WITH BLACK SEED OIL'),
  (1340, 'ECOM01-0323', 'OC-0690', 1000, date '2026-06-18', 3.23, 'ACEITE DE OREGANO 300SG BLANCO OIL OF OREGANO WITH BLACK SEED OIL'),
  (10, 'ECOM01-0115', 'OC-0336', 1000, date '2026-01-22', 3.51, 'ACEITE DE SEMILLA DE CALABAZA 180SG PUMPKIN SEED OIL'),
  (10, 'ECOM01-0227', 'OC-0473', 1000, date '2026-04-24', 3.62, 'ACEITE DE SEMILLA DE CALABAZA 180SG PUMPKIN SEED OIL'),
  (10, 'ECOM01-0290', 'OC-0519', 1000, date '2026-05-27', 3.62, 'ACEITE DE SEMILLA DE CALABAZA 180SG PUMPKIN SEED OIL'),
  (10, 'ECOM01-0359', 'OC-0749', 1000, date '2026-07-30', 3.61, 'ACEITE DE SEMILLA DE CALABAZA 180SG PUMPKIN SEED OIL'),
  (8, 'ECOM01-0205', 'OC-0421', 1000, date '2026-03-23', 2.87, 'ACEITE DE OREGANO 300SG VIVONU VERDE WITH BLACK SEED OIL'),
  (8, 'ECOM01-0325', 'OC-0691', 1000, date '2026-06-18', 2.9, 'ACEITE DE OREGANO 300SG VIVONU VERDE WITH BLACK SEED OIL'),
  (11, 'ECOM01-0204', 'OC-0431', 1000, date '2026-03-23', 2.98, 'AGED GARLIC EXTRACT ODORLESS 300SG EXTRACTO DE AJO'),
  (12, 'ECOM01-0266', 'OC-0572', 600, date '2026-05-19', 0.66, 'ALARMA MAGNETICA PARA PUERTAS Y VENTANAS'),
  (13, 'ECOM01-0267', 'OC-0577', 300, date '2026-05-19', 4.18, 'ALMOHADA ORTOPEDICA'),
  (13, 'ECOM01-0380', 'OC-0809', 300, date '2026-09-25', 5.6, 'ALMOHADA ORTOPEDICA'),
  (14, 'PA-00160', 'OC-0172', 500, date '2025-07-07', 4.69, 'ALMOHADA DE VIAJE'),
  (15, 'PA-00041', 'OC-0042', 200, date '2023-12-04', null, 'ANTENA DE TV DIGITAL ULTRA HD 4K'),
  (15, 'ECOM01-0039', 'OC-0248', 1000, date '2025-11-20', 2.48, 'ANTENA DE TV DIGITAL ULTRA HD 4K'),
  (15, 'ECOM01-0149', 'OC-0376', 1000, date '2026-02-20', 2.21, 'ANTENA DE TV DIGITAL ULTRA HD 4K'),
  (15, 'ECOM01-0273', 'OC-0595', 1000, date '2026-05-19', 2.25, 'ANTENA DE TV DIGITAL ULTRA HD 4K'),
  (15, 'ECOM01-0311', 'OC-0632', 1000, date '2026-06-12', 2.04, 'ANTENA DE TV DIGITAL ULTRA HD 4K'),
  (15, 'ECOM01-0379', 'OC-0827', 1000, date '2026-09-25', 2.14, 'ANTENA DE TV DIGITAL ULTRA HD 4K'),
  (16, 'ECOM01-0253', 'OC-0551', 1000, date '2026-05-05', 1.79, 'ANTI HPV'),
  (17, 'ECOM01-0349', 'OC-0775', 1152, date '2026-08-04', 2.12, 'ANTI MELASMA CICA CREAM'),
  (20, 'ECOM01-0220', 'OC-0420', 788, date '2026-04-14', 5.05, 'ASHWAGANDHA 300 CAPSULAS'),
  (20, 'ECOM01-0225', 'OC-0465', 1210, date '2026-04-24', 5.2, 'ASHWAGANDHA 300 CAPSULAS'),
  (21, 'ECOM01-0202', 'OC-0444', 2000, date '2026-03-23', 2.0, 'ASTAXANTHIN'),
  (22, 'PA-00161', 'OC-0174', 302, date '2025-06-18', 37.61, 'AUXILIAR DE PARTIDA 4 EN 1'),
  (646, 'ECOM01-0424', 'OC-0979', 400, date '2026-11-18', 0.63, 'BOLSAS ALMACENAMIENTO REUSABLE'),
  (23, 'PA-00176', 'OC-0205', 1584, date '2025-09-01', 0.43, 'BALSAMO FACIAL HIDRATANTE'),
  (23, 'ECOM01-0112', 'OC-0338', 994, date '2026-01-22', 0.4, 'BALSAMO FACIAL HIDRATANTE'),
  (24, 'PA-0006', 'OC-0015', 300, date '2023-09-14', null, 'BALSAMO HIDRATANTE DEROL 7G'),
  (24, 'PA-00031', 'OC-0029', 960, date '2023-09-21', null, 'BALSAMO HIDRATANTE DEROL 7G'),
  (24, 'ECOM01-0072', 'OC-0298', 480, date '2026-01-08', 2.05, 'BALSAMO HIDRATANTE DEROL 7G'),
  (25, 'PA-00168', 'OC-0183', 300, date '2025-07-07', 3.033333, 'BANDA MOLDEADORA DE CINTURA DE AVISPA'),
  (25, 'ECOM01-0047', 'OC-0263', 300, date '2025-10-07', 7.09, 'BANDA MOLDEADORA DE CINTURA DE AVISPA'),
  (25, 'ECOM01-0300', 'OC-0624', 500, date '2026-06-12', 3.26, 'BANDA MOLDEADORA DE CINTURA DE AVISPA'),
  (26, 'PA-00151', 'OC-0163', 200, date '2025-06-03', 2.54, 'BANDA DE EJERCICIO CON PEDALES AZUL'),
  (26, 'PA-00172', 'OC-0188', 200, date '2025-08-26', 2.46, 'BANDA DE EJERCICIO CON PEDALES AZUL'),
  (26, 'ECOM01-0063', 'OC-0285', 500, date '2025-12-23', 2.21, 'BANDA DE EJERCICIO CON PEDALES AZUL'),
  (26, 'ECOM01-0228', 'OC-0513', 300, date '2026-04-24', 2.26, 'BANDA DE EJERCICIO CON PEDALES AZUL'),
  (27, 'PA-00151', 'OC-0163', 600, date '2025-06-03', 2.54, 'BANDA DE EJERCICIO CON PEDALES MORADO'),
  (27, 'PA-00172', 'OC-0188', 150, date '2025-08-26', 2.46, 'BANDA DE EJERCICIO CON PEDALES MORADO'),
  (27, 'ECOM01-0063', 'OC-0285', 300, date '2025-12-23', 2.21, 'BANDA DE EJERCICIO CON PEDALES MORADO'),
  (27, 'ECOM01-0228', 'OC-0513', 200, date '2026-04-24', 2.26, 'BANDA DE EJERCICIO CON PEDALES MORADO'),
  (28, 'PA-00151', 'OC-0163', 200, date '2025-06-03', 2.54, 'BANDA DE EJERCICIO CON PEDALES ROSA'),
  (28, 'ECOM01-0063', 'OC-0285', 200, date '2025-12-23', 2.21, 'BANDA DE EJERCICIO CON PEDALES ROSA'),
  (28, 'ECOM01-0228', 'OC-0513', 500, date '2026-04-24', 2.26, 'BANDA DE EJERCICIO CON PEDALES ROSA'),
  (29, 'ECOM01-0123', 'OC-0344', 500, date '2026-01-14', 2.46, 'BASE DE MAQUILLAJE ZEPHOCO DARK'),
  (30, 'ECOM01-0123', 'OC-0344', 500, date '2026-01-14', 2.46, 'BASE DE MAQUILLAJE ZEPHOCO NATURAL'),
  (30, 'ECOM01-0237', 'OC-0515', 999, date '2026-05-05', 2.59, 'BASE DE MAQUILLAJE ZEPHOCO NATURAL'),
  (31, 'ECOM01-0137', 'OC-0356', 1080, date '2026-02-11', 1.17, 'BEE VENOM CREMA TRATAMIENTO 60G'),
  (32, 'ECOM01-0177', 'OC-0392', 1000, date '2026-04-24', 0.8, 'BEEBREATHE INHALADOR'),
  (146, 'ECOM01-0246', 'OC-0532', 960, date '2026-05-05', 1.63, 'BEETROOT 60C ROSABELLA REMOLACHA'),
  (164, 'ECOM01-0018', 'OC-0234', 1000, date '2025-10-21', 5.69, 'BIYODE PURE HIMALAYAN SHILAJIT GOLD GUMMIES 60GOM SHILAJIT EN GOMITAS'),
  (164, 'ECOM01-0050', 'OC-0273', 1000, date '2025-11-20', 4.47, 'BIYODE PURE HIMALAYAN SHILAJIT GOLD GUMMIES 60GOM SHILAJIT EN GOMITAS'),
  (164, 'ECOM01-0114', 'OC-0337', 1000, date '2026-01-22', 4.49, 'BIYODE PURE HIMALAYAN SHILAJIT GOLD GUMMIES 60GOM SHILAJIT EN GOMITAS'),
  (164, 'ECOM01-0249', 'OC-0524', 1000, date '2026-05-05', 4.61, 'BIYODE PURE HIMALAYAN SHILAJIT GOLD GUMMIES 60GOM SHILAJIT EN GOMITAS'),
  (164, 'ECOM01-0289', 'OC-0619', 1000, date '2026-05-27', 4.61, 'BIYODE PURE HIMALAYAN SHILAJIT GOLD GUMMIES 60GOM SHILAJIT EN GOMITAS'),
  (33, 'ECOM01-0191', 'OC-0422', 960, date '2026-03-23', 2.68, 'BLANQUEADOR DENTAL SIIMUNANA'),
  (80, 'ECOM01-0077', 'OC-0297', 500, date '2026-01-08', 2.8, 'BODY ENTERIZO'),
  (80, 'ECOM01-0242', 'OC-0522', 500, date '2026-05-05', 2.92, 'BODY ENTERIZO'),
  (81, 'PA-000152', 'OC-0160', 300, date '2025-02-28', 4.13, 'BODY VIRAL'),
  (81, 'ECOM01-0065', 'OC-0286', 300, date '2025-10-31', 3.2, 'BODY VIRAL'),
  (81, 'ECOM01-0125', 'OC-0346', 300, date '2025-12-11', 3.94, 'BODY VIRAL'),
  (81, 'ECOM01-0141', 'OC-0369', 300, date '2026-01-14', 3.2, 'BODY VIRAL'),
  (81, 'ECOM01-0146', 'OC-0373', 500, date '2026-02-20', 2.61, 'BODY VIRAL'),
  (34, 'ECOM01-0124', 'OC-0341', 1960, date '2026-01-14', 1.72, 'BODYWISE HAIR GROWTH SERUM ROLL ON 25 ML SUERO CAPILAR'),
  (34, 'ECOM01-0309', 'OC-0642', 1000, date '2026-06-12', 1.62, 'BODYWISE HAIR GROWTH SERUM ROLL ON 25 ML SUERO CAPILAR'),
  (34, 'ECOM01-0435', 'OC-0830', 1249, date '2026-10-31', 1.59, 'BODYWISE HAIR GROWTH SERUM ROLL ON 25 ML SUERO CAPILAR'),
  (35, 'ECOM01-0139', 'OC-0351', 6490, date '2026-02-11', 0.21, 'BOLSAS DE BURBUJAS L'),
  (35, 'ECOM01-0224', 'OC-0509', 12000, date '2026-04-24', 0.27, 'BOLSAS DE BURBUJAS L'),
  (35, 'ECOM01-0277', 'OC-0581', 24500, date '2026-05-19', 0.25, 'BOLSAS DE BURBUJAS L'),
  (36, 'PA-00159', 'OC-0171', 100, date '2025-06-18', 8.6333, 'BOLSO BANDOLERO MULTICHIC MARRON'),
  (36, 'PA-00187', 'OC-0217', 150, date '2025-10-02', 4.1, 'BOLSO BANDOLERO MULTICHIC MARRON'),
  (37, 'PA-00159', 'OC-0171', 150, date '2025-06-18', 8.633333, 'BOLSO BANDOLERO MULTICHIC NEGRO'),
  (37, 'PA-00187', 'OC-0217', 150, date '2025-10-02', 4.1, 'BOLSO BANDOLERO MULTICHIC NEGRO'),
  (1174, 'ECOM01-0371', 'OC-0808', 100, date '2026-09-25', 16.0, 'BOTAS MAXI PRO'),
  (40, 'ECOM01-0071', 'OC-0292', 1000, date '2026-01-08', 0.87, 'BOTOX STOCK SOLUTION 30ML'),
  (42, 'ECOM01-0239', 'OC-0543', 987, date '2026-05-05', 2.86, 'BALSAMO ESTIMULADOR DE BARBA APOLO'),
  (42, 'ECOM01-0362', 'OC-0789', 1018, date '2026-07-30', 2.84, 'BALSAMO ESTIMULADOR DE BARBA APOLO'),
  (43, 'ECOM01-0251', 'OC-0541', 1000, date '2026-05-05', 2.52, 'CABEZAL DE DUCHA'),
  (44, 'PA-00155', 'OC-0167', 500, date '2025-06-03', 5.52, 'CAMISA STRETCH DE CABALLERO'),
  (45, 'ECOM01-0032', 'OC-0256', 1000, date '2025-11-18', 1.85, 'CANDIDA CLEANSE'),
  (45, 'ECOM01-0092', 'OC-0309', 1000, date '2026-01-08', 1.87, 'CANDIDA CLEANSE'),
  (45, 'ECOM01-0128', 'OC-0347', 1000, date '2026-02-06', 1.86, 'CANDIDA CLEANSE'),
  (45, 'ECOM01-0154', 'OC-0386', 1000, date '2026-02-20', 1.87, 'CANDIDA CLEANSE'),
  (45, 'ECOM01-0369', 'OC-0792', 960, date '2026-08-31', 1.739583, 'CANDIDA CLEANSE'),
  (46, 'ECOM01-0264', 'OC-0549', 510, date '2026-05-19', 8.16, 'CARGADOR INTELIGENTE DE BATERIA 12V'),
  (48, 'ECOM01-0048', 'OC-0255', 1000, date '2025-10-08', 1.08, 'CARILLAS DE DENTALES SNAPON SMILE'),
  (48, 'ECOM01-0075', 'OC-0258', 1000, date '2025-10-31', 1.04, 'CARILLAS DE DENTALES SNAPON SMILE'),
  (48, 'ECOM01-0089', 'OC-0324', 1000, date '2025-11-20', 1.05, 'CARILLAS DE DENTALES SNAPON SMILE'),
  (48, 'ECOM01-0099', 'OC-0325', 1000, date '2025-11-20', 0.855, 'CARILLAS DE DENTALES SNAPON SMILE'),
  (49, 'ECOM01-0062', 'OC-0243', 926, date '2025-12-23', 3.1, 'CHAMPOO DE ROMERO'),
  (50, 'PA-00073', 'OC-0075', 300, date '2024-04-02', null, 'CINTURON LUMBAR'),
  (50, 'ECOM01-0080', 'OC-0266', 300, date '2025-11-18', 5.15, 'CINTURON LUMBAR'),
  (50, 'ECOM01-0147', 'OC-0371', 1000, date '2026-02-20', 2.08, 'CINTURON LUMBAR'),
  (52, 'ECOM01-0095', 'OC-0318', 1000, date '2026-01-08', 1.75, 'COLLAGEN PEPTIDES TOPLUX 90CAP COLAGENO EN CAPSULAS'),
  (52, 'ECOM01-0133', 'OC-0355', 1000, date '2026-02-06', 1.74, 'COLLAGEN PEPTIDES TOPLUX 90CAP COLAGENO EN CAPSULAS'),
  (52, 'ECOM01-0282', 'OC-0599', 960, date '2026-06-12', 1.52, 'COLLAGEN PEPTIDES TOPLUX 90CAP COLAGENO EN CAPSULAS'),
  (52, 'ECOM01-0305', 'OC-0635', 960, date '2026-07-06', 1.65, 'COLLAGEN PEPTIDES TOPLUX 90CAP COLAGENO EN CAPSULAS'),
  (53, 'ECOM01-0278', 'OC-0540', 2010, date '2026-06-12', 5.34, 'COLLAGENO BIO PEPTIDES EN POLVO NEOCELL'),
  (53, 'ECOM01-0370', 'OC-0851', 1980, date '2026-09-16', 5.919192, 'COLLAGENO BIO PEPTIDES EN POLVO NEOCELL'),
  (55, 'ECOM01-0312', 'OC-0643', 480, date '2026-06-12', 3.21, 'COMPRESOR DE AIRE'),
  (56, 'PA-00072', 'OC-0074', 300, date '2024-04-10', null, 'CORRECTOR DE POSTURA'),
  (56, 'PA-00092', 'OC-0093', 300, date '2024-05-29', 5.520267, 'CORRECTOR DE POSTURA'),
  (56, 'ECOM01-0078', 'OC-0288', 500, date '2026-01-08', 3.29, 'CORRECTOR DE POSTURA'),
  (56, 'ECOM01-0268', 'OC-0580', 500, date '2026-05-19', 3.37, 'CORRECTOR DE POSTURA'),
  (550, 'ECOM01-0411', 'OC-0948', 300, date '2026-11-18', 5.4, 'CORRECTOR DE POSTURA MASAJEADOR LUMBAR'),
  (636, 'ECOM01-0412', 'OC-0927', 300, date '2026-11-18', 20.65, 'CORTADORA DE PASTO'),
  (718, 'ECOM01-0419', 'OC-0985', 600, date '2026-11-23', 0.87, 'CORTAUNAS DE PIE DE MANDIBULA ANCHA'),
  (91, 'ECOM01-0270', 'OC-0548', 1008, date '2026-05-19', 3.57, 'CREATINE MONOHYDRATE GUMMIES 120GOM GOMITAS DE CREATINA MONOHIDRATO'),
  (57, 'ECOM01-0105', 'OC-0316', 998, date '2026-01-08', 3.03, 'CREATINE MONOHYDRATE FOR WOMEN OLD SCHOOL CREATINA PARA MUJER'),
  (57, 'ECOM01-0226', 'OC-0463', 1998, date '2026-04-24', 3.12, 'CREATINE MONOHYDRATE FOR WOMEN OLD SCHOOL CREATINA PARA MUJER'),
  (57, 'ECOM01-0299', 'OC-0637', 1000, date '2026-06-12', 3.14, 'CREATINE MONOHYDRATE FOR WOMEN OLD SCHOOL CREATINA PARA MUJER'),
  (57, 'ECOM01-0338', 'OC-0722', 1999, date '2026-08-12', 2.824412, 'CREATINE MONOHYDRATE FOR WOMEN OLD SCHOOL CREATINA PARA MUJER'),
  (74, 'ECOM01-0073', 'OC-0295', 1000, date '2026-01-08', 1.59, 'CREMA DR ALTHEA 345 RELIEF CREAM 15ML'),
  (58, 'ECOM01-0107', 'OC-0321', 900, date '2026-01-22', 1.7, 'CREMA HIDRATANTE NIDA 100ML'),
  (58, 'ECOM01-0223', 'OC-0514', 1000, date '2026-04-24', 1.76, 'CREMA HIDRATANTE NIDA 100ML'),
  (58, 'ECOM01-0363', 'OC-0788', 1000, date '2026-08-01', 1.75, 'CREMA HIDRATANTE NIDA 100ML'),
  (59, 'PA-00145', 'OC-0154', 1000, date '2025-04-28', 0.92, 'CREMA LIFTING BOTOX VENENO DE ABEJA'),
  (59, 'PA-00180', 'OC-0202', 1000, date '2025-09-01', 0.88, 'CREMA LIFTING BOTOX VENENO DE ABEJA'),
  (59, 'ECOM01-0113', 'OC-0339', 1000, date '2026-01-22', 0.82, 'CREMA LIFTING BOTOX VENENO DE ABEJA'),
  (62, 'ECOM01-0274', 'OC-0594', 2160, date '2026-05-19', 1.02, 'CREMA REPARADORA DE UNAS AICHUN BEAUTY'),
  (54, 'ECOM01-0012', 'OC-0221', 1000, date '2025-10-21', 1.9, 'CREMA TERAPIA ARTICULAR BEE VENOM 100G'),
  (54, 'ECOM01-0084', 'OC-0307', 1000, date '2026-01-08', 1.83, 'CREMA TERAPIA ARTICULAR BEE VENOM 100G'),
  (64, 'PA-0002', 'OC-0003', 504, date '2023-11-02', 5.202857, 'CUADERNO DE TRAZOS PARA NINOS'),
  (64, 'PA-00157', 'OC-0169', 500, date '2025-06-03', 2.6, 'CUADERNO DE TRAZOS PARA NINOS'),
  (64, 'ECOM01-0024', 'OC-0245', 520, date '2025-10-28', 2.52, 'CUADERNO DE TRAZOS PARA NINOS'),
  (64, 'ECOM01-0197', 'OC-0429', 240, date '2026-03-23', 3.07, 'CUADERNO DE TRAZOS PARA NINOS'),
  (65, 'ECOM01-0364', 'OC-0783', 988, date '2026-07-30', 1.44, 'CUCHILLO MULTIFUNCIONAL'),
  (67, 'ECOM01-0069', 'OC-0296', 1000, date '2025-12-15', 2.1, 'DHT BLOCKER'),
  (67, 'ECOM01-0131', 'OC-0354', 1000, date '2026-02-06', 2.08, 'DHT BLOCKER'),
  (67, 'ECOM01-0172', 'OC-0377', 1000, date '2026-03-07', 2.08, 'DHT BLOCKER'),
  (70, 'ECOM01-0151', 'OC-0370', 1000, date '2026-02-20', 1.36, 'DEOS DESODORANTE INTERNO'),
  (70, 'ECOM01-0262', 'OC-0529', 992, date '2026-05-19', 1.4, 'DEOS DESODORANTE INTERNO'),
  (70, 'ECOM01-0280', 'OC-0585', 992, date '2026-06-12', 1.26, 'DEOS DESODORANTE INTERNO'),
  (70, 'ECOM01-0343', 'OC-0704', 992, date '2026-08-04', 1.36, 'DEOS DESODORANTE INTERNO'),
  (1173, 'ECOM01-0340', 'OC-0762', 1000, date '2026-08-12', 5.04, 'DEPILADORA FEMENINA'),
  (72, 'PA-00186', 'OC-0209', 500, date '2025-10-02', 2.86, 'DISPOSITIVO ANTIALERGIA RINITIS'),
  (73, 'PA-00149', 'OC-0158', 300, date '2025-05-14', 3.85, 'DISPOSITIVO ANTIRRONQUIDOS'),
  (73, 'PA-00174', 'OC-0200', 300, date '2025-07-11', 3.816667, 'DISPOSITIVO ANTIRRONQUIDOS'),
  (73, 'PA-00191', 'OC-0249', 300, date '2025-09-23', 4.42, 'DISPOSITIVO ANTIRRONQUIDOS'),
  (73, 'ECOM01-0179', 'OC-0412', 500, date '2026-04-24', 3.56, 'DISPOSITIVO ANTIRRONQUIDOS'),
  (75, 'ECOM01-0045', 'OC-0265', 1000, date '2025-11-20', 1.59, 'EVIL GOODS'),
  (75, 'ECOM01-0101', 'OC-0308', 1000, date '2026-01-08', 1.6, 'EVIL GOODS'),
  (75, 'ECOM01-0135', 'OC-0366', 1000, date '2026-02-11', 1.58, 'EVIL GOODS'),
  (75, 'ECOM01-0238', 'OC-0527', 960, date '2026-05-05', 1.67, 'EVIL GOODS'),
  (75, 'ECOM01-0287', 'OC-0618', 959, date '2026-05-27', 1.66, 'EVIL GOODS'),
  (75, 'ECOM01-0329', 'OC-0702', 960, date '2026-06-30', 1.64, 'EVIL GOODS'),
  (76, 'ECOM01-0183', 'OC-0395', 960, date '2026-03-23', 1.54, 'EMMA BIOACTIVES'),
  (641, 'ECOM01-0418', 'OC-0928', 528, date '2026-11-20', 10.59, 'ENCHUFE EXTENSOR'),
  (694, 'ECOM01-0420', 'OC-0986', 500, date '2026-11-23', 6.68, 'ESCANER DE DIAGNOSTICO OBD2 PARA AUTOS'),
  (77, 'PA-00175', 'OC-0198', 500, date '2025-10-30', 1.88, 'ESCOBA DE LIMPIEZA 3EN1 CON CABEZAL GIRATORIO'),
  (77, 'ECOM01-0196', 'OC-0423', 280, date '2026-03-23', 1.88, 'ESCOBA DE LIMPIEZA 3EN1 CON CABEZAL GIRATORIO'),
  (78, 'ECOM01-0021', 'OC-0244', 1000, date '2025-11-18', 1.54, 'ESPUMA DE DEPILACION ELHOOE'),
  (79, 'ECOM01-0281', 'OC-0596', 960, date '2026-06-12', 1.52, 'ETHIOPIAN BLACK SEED OIL'),
  (273, 'ECOM01-0383', 'OC-0763', 1020, date '2026-11-17', 2.35, 'EXCALVO SHAMPOO DE CEBOLLA 236ML'),
  (295, 'ECOM01-0385', 'OC-0806', 998, date '2026-11-17', 4.28, 'FAJA MOLDEADORA TIPO PANTY 4 EN 1 MORINGA BERBERINE'),
  (82, 'ECOM01-0173', 'OC-0381', 1008, date '2026-03-07', 2.31, 'FAST HYDRATION ROSABELLA'),
  (83, 'ECOM01-0269', 'OC-0576', 1935, date '2026-05-19', 1.77, 'FIBER GUMMIES'),
  (83, 'ECOM01-0376', 'OC-0853', 1892, date '2026-09-25', 1.674419, 'FIBER GUMMIES'),
  (84, 'ECOM01-0068', 'OC-0275', 1000, date '2025-12-15', 3.0, 'FINO HAIR MASK'),
  (85, 'ECOM01-0081', 'OC-0289', 1000, date '2026-01-08', 1.71, 'FORGE SKIN FOR MEN'),
  (85, 'ECOM01-0283', 'OC-0539', 1000, date '2026-05-27', 1.73, 'FORGE SKIN FOR MEN'),
  (86, 'ECOM01-0022', 'OC-0237', 1000, date '2025-11-18', 2.08, 'FRUITDYE CREMA DE TINTE CON PEINE APLICADOR'),
  (87, 'ECOM01-0212', 'OC-0417', 1338, date '2026-04-14', 0.89, 'FUNGAL NAIL PATCHES'),
  (87, 'ECOM01-0275', 'OC-0587', 1345, date '2026-05-19', 0.9, 'FUNGAL NAIL PATCHES'),
  (88, 'ECOM01-0258', 'OC-0552', 959, date '2026-05-05', 1.1, 'GEL EXFOLIANTE ORANGE'),
  (88, 'ECOM01-0256', 'OC-0593', 2000, date '2026-05-05', 0.66, 'GEL EXFOLIANTE ORANGE'),
  (88, 'ECOM01-0293', 'OC-0631', 2000, date '2026-06-12', 0.59, 'GEL EXFOLIANTE ORANGE'),
  (88, 'ECOM01-0347', 'OC-0741', 2000, date '2026-08-04', 0.65, 'GEL EXFOLIANTE ORANGE'),
  (90, 'ECOM01-0247', 'OC-0547', 1008, date '2026-05-05', 1.79, 'GLUCO GONE CLEAN NUTRA'),
  (92, 'ECOM01-0182', 'OC-0391', 1000, date '2026-03-23', 4.14, 'GOMITAS LUCKSTAR GABA 60GOM'),
  (93, 'ECOM01-0171', 'OC-0380', 2000, date '2026-03-07', 2.25, 'HAIR GROWTH CAPSULAS'),
  (93, 'ECOM01-0322', 'OC-0645', 960, date '2026-06-18', 2.26, 'HAIR GROWTH CAPSULAS'),
  (93, 'ECOM01-0326', 'OC-0657', 960, date '2026-06-18', 2.12, 'HAIR GROWTH CAPSULAS'),
  (93, 'ECOM01-0414', 'OC-0972', 960, date '2026-11-23', 2.07, 'HAIR GROWTH CAPSULAS'),
  (94, 'ECOM01-0279', 'OC-0550', 980, date '2026-05-27', 2.73, 'HELPS EYE HEALTH 90CAP VITAMINA PARA LA SALUD OCULAR'),
  (95, 'ECOM01-0206', 'OC-0372', 2000, date '2026-03-23', 2.69, 'HISMILE TIRAS BLANQUEADORAS DENTAL'),
  (95, 'ECOM01-0358', 'OC-0753', 1991, date '2026-07-30', 2.53, 'HISMILE TIRAS BLANQUEADORAS DENTAL'),
  (96, 'PA-00184', 'OC-0214', 300, date '2025-09-19', 3.65, 'HOMBRERAS DE COMPRESION'),
  (97, 'ECOM01-0213', 'OC-0416', 1008, date '2026-04-14', 1.26, 'HOME STAIN CLEANER'),
  (561, 'ECOM01-0409', 'OC-0946', 300, date '2026-11-18', 5.32, 'IRRIGADOR BUCAL'),
  (756, 'ECOM01-0423', 'OC-0989', 300, date '2026-11-18', 2.69, 'INTERRUPTOR DE CORTE DE ENERGIA PARA BATERIA DE COCHE'),
  (558, 'ECOM01-0408', 'OC-0952', 1001, date '2026-11-23', 2.0, 'INTIMATE ROSE INOSITOL SUPLEMENTO INOSITOL 120CAP'),
  (98, 'ECOM01-0276', 'OC-0571', 2100, date '2026-05-19', 1.45, 'JJL BRO MEN S EXTERNAL DELAYED SPRAY'),
  (99, 'ECOM01-0058', 'OC-0269', 1000, date '2025-12-23', 3.08, 'KING MAKER'),
  (99, 'ECOM01-0104', 'OC-0311', 1000, date '2026-01-08', 3.07, 'KING MAKER'),
  (395, 'ECOM01-0440', 'OC-0954', 500, date '2026-10-31', 1.37, 'KIT DE BOTONES A PRESION'),
  (100, 'ECOM01-0042', 'OC-0280', 1000, date '2025-11-18', 1.07, 'KREAIN GEL PARA EL DOLOR ARTICULAR'),
  (102, 'PA-00163', 'OC-0176', 1000, date '2025-06-18', 1.49, 'LEFUN BODY OIL'),
  (102, 'ECOM01-0109', 'OC-0334', 500, date '2026-01-22', 1.37, 'LEFUN BODY OIL'),
  (103, 'ECOM01-0121', 'OC-0330', 2000, date '2026-01-14', 2.21, 'LEMME BURN'),
  (103, 'ECOM01-0229', 'OC-0517', 2100, date '2026-05-05', 2.3, 'LEMME BURN'),
  (103, 'ECOM01-0356', 'OC-0726', 1925, date '2026-07-30', 2.13, 'LEMME BURN'),
  (104, 'ECOM01-0318', 'OC-0640', 1050, date '2026-06-18', 2.16, 'LEMME PURR'),
  (105, 'ECOM01-0079', 'OC-0293', 1000, date '2026-01-08', 1.07, 'LENTES ONE READER'),
  (105, 'ECOM01-0265', 'OC-0565', 1000, date '2026-05-19', 1.08, 'LENTES ONE READER'),
  (105, 'ECOM01-0334', 'OC-0692', 1000, date '2026-06-30', 1.08, 'LENTES ONE READER'),
  (1344, 'None', 'OC-0047', 1000, date '2023-12-21', 3.35, 'LENTES DE LECTURA TR90 CON ESTUCHE DE BUENA CALIDAD'),
  (107, 'PA-00182', 'OC-0208', 200, date '2025-09-01', 6.13, 'LIBRO MONTESSORI AZUL GRANDE'),
  (107, 'ECOM01-0150', 'OC-0387', 200, date '2026-02-20', 6.77, 'LIBRO MONTESSORI AZUL GRANDE'),
  (107, 'ECOM01-0336', 'OC-0700', 200, date '2026-06-30', 7.04, 'LIBRO MONTESSORI AZUL GRANDE'),
  (1522, 'ECOM01-0382', 'OC-0411', 198, date '2026-11-17', 22.16, 'LIMPIADOR A VAPOR PORTATIL DE ALTA PRESION PHUEUT STEAM CLEANER NEW'),
  (108, 'PA-00156', 'OC-0164', 300, date '2025-06-03', 28.39, 'LIMPIADOR DE ALTA PRESION A VAPOR 2500W STEAM CLEANER'),
  (108, 'PA-00181', 'OC-0204', 200, date '2025-09-01', 26.71, 'LIMPIADOR DE ALTA PRESION A VAPOR 2500W STEAM CLEANER'),
  (108, 'ECOM01-0035', 'OC-0260', 300, date '2025-11-20', 24.06, 'LIMPIADOR DE ALTA PRESION A VAPOR 2500W STEAM CLEANER'),
  (108, 'ECOM01-0240', 'OC-0462', 304, date '2026-05-05', 23.73, 'LIMPIADOR DE ALTA PRESION A VAPOR 2500W STEAM CLEANER'),
  (108, 'ECOM01-0373', 'OC-0837', 192, date '2026-09-25', 23.0, 'LIMPIADOR DE ALTA PRESION A VAPOR 2500W STEAM CLEANER'),
  (71, 'ECOM01-0106', 'OC-0319', 1000, date '2026-01-08', 0.65, 'LIMPIADOR Y DESTAPA CANERIA TORNADO'),
  (71, 'ECOM01-0187', 'OC-0425', 1000, date '2026-03-23', 0.66, 'LIMPIADOR Y DESTAPA CANERIA TORNADO'),
  (109, 'ECOM01-0190', 'OC-0414', 960, date '2026-03-23', 1.67, 'LIPOSOMAL VITAMINA C TOP LUX'),
  (110, 'ECOM01-0132', 'OC-0349', 1000, date '2026-02-06', 1.88, 'LIVER APOYO PARA DESINTOXICACION'),
  (110, 'ECOM01-0321', 'OC-0644', 960, date '2026-06-18', 1.96, 'LIVER APOYO PARA DESINTOXICACION'),
  (110, 'ECOM01-0415', 'OC-0973', 480, date '2026-11-23', 1.77, 'LIVER APOYO PARA DESINTOXICACION'),
  (112, 'PA-00189', 'OC-0216', 77000, date '2025-10-27', 0.037143, 'MAILER BAG'),
  (112, 'ECOM01-0211', 'OC-0445', 75000, date '2026-04-14', 0.03, 'MAILER BAG'),
  (112, 'ECOM01-0252', 'OC-0508', 76500, date '2026-05-05', 0.04, 'MAILER BAG'),
  (475, 'ECOM01-0367', 'OC-0781', 1010, date '2026-08-31', 2.83, 'MAGNESIO 12 EN 1'),
  (114, 'ECOM01-0031', 'OC-0257', 1000, date '2025-11-18', 1.88, 'MAGNESIUM COMPLEX TOPLUX 90C MAGNESIO'),
  (114, 'ECOM01-0093', 'OC-0310', 1000, date '2026-01-08', 1.88, 'MAGNESIUM COMPLEX TOPLUX 90C MAGNESIO'),
  (114, 'ECOM01-0129', 'OC-0348', 1000, date '2026-02-06', 1.87, 'MAGNESIUM COMPLEX TOPLUX 90C MAGNESIO'),
  (114, 'ECOM01-0155', 'OC-0385', 1000, date '2026-02-20', 1.88, 'MAGNESIUM COMPLEX TOPLUX 90C MAGNESIO'),
  (114, 'ECOM01-0231', 'OC-0518', 1920, date '2026-05-05', 1.89, 'MAGNESIUM COMPLEX TOPLUX 90C MAGNESIO'),
  (114, 'ECOM01-0306', 'OC-0606', 960, date '2026-07-06', 1.71, 'MAGNESIUM COMPLEX TOPLUX 90C MAGNESIO'),
  (114, 'ECOM01-0357', 'OC-0730', 1920, date '2026-07-30', 1.87, 'MAGNESIUM COMPLEX TOPLUX 90C MAGNESIO'),
  (114, 'ECOM01-0416', 'OC-0974', 960, date '2026-11-23', 1.72, 'MAGNESIUM COMPLEX TOPLUX 90C MAGNESIO'),
  (116, 'ECOM01-0178', 'OC-0413', 500, date '2026-04-24', 0.96, 'MEDIAS DE COMPRESION DEDOS LIBRES'),
  (291, 'ECOM01-0386', 'OC-0941', 1008, date '2026-10-19', 1.220238, 'MEDICUBE PINK PEPTIDE SERUM'),
  (118, 'ECOM01-0203', 'OC-0460', 1000, date '2026-03-23', 2.51, 'MENOPAUSIA PROBIOTICOS'),
  (120, 'ECOM01-0040', 'OC-0270', 200, date '2025-10-04', 5.38, 'MINI CAMARA ESPIA REDONDEADA CAJA ROJA'),
  (120, 'ECOM01-0088', 'OC-0301', 200, date '2025-11-24', 5.8, 'MINI CAMARA ESPIA REDONDEADA CAJA ROJA'),
  (120, 'ECOM01-0145', 'OC-0383', 600, date '2026-02-20', 4.1, 'MINI CAMARA ESPIA REDONDEADA CAJA ROJA'),
  (120, 'ECOM01-0422', 'OC-1106', 200, date '2026-11-20', 3.93, 'MINI CAMARA ESPIA REDONDEADA CAJA ROJA'),
  (121, 'PA-00100', 'OC-0104', 300, date '2024-07-23', null, 'MINI CAMARA LARGA ESPIA CAJA NEGRA'),
  (121, 'PA-00121', 'OC-0113', 300, date '2024-08-12', null, 'MINI CAMARA LARGA ESPIA CAJA NEGRA'),
  (121, 'ECOM01-0041', 'OC-0271', 300, date '2025-10-04', 6.83, 'MINI CAMARA LARGA ESPIA CAJA NEGRA'),
  (122, 'PA-00153', 'OC-0165', 300, date '2025-06-18', 6.37, 'MINI LINTERNA TACTICA LED'),
  (122, 'ECOM01-0272', 'OC-0542', 960, date '2026-05-19', 2.53, 'MINI LINTERNA TACTICA LED'),
  (677, 'ECOM01-0421', 'OC-0940', 300, date '2026-11-20', 21.79, 'MINI BICICLETA ESTATICA'),
  (594, 'ECOM01-0436', 'OC-0951', 288, date '2026-10-31', 4.8, 'MOLINILLO DE CAFE ELECTRICO MULTIFUNCIONAL RAF'),
  (123, 'PA-00141', 'OC-0135', 650, date '2024-12-16', 5.123077, 'MONOCULAR TELESCOPIO PORTATIL DE LARGO ALCANCE'),
  (123, 'ECOM01-0100', 'OC-0320', 500, date '2026-01-08', 2.85, 'MONOCULAR TELESCOPIO PORTATIL DE LARGO ALCANCE'),
  (123, 'ECOM01-0316', 'OC-0636', 300, date '2026-06-18', 2.9, 'MONOCULAR TELESCOPIO PORTATIL DE LARGO ALCANCE'),
  (124, 'ECOM01-0189', 'OC-0407', 1000, date '2026-03-23', 3.89, 'MULTI COLLAGEN COMPLEX FOR WOMEN 240CAP COLAGENO EN CAPSULAS MICROINGREDIENTS'),
  (124, 'ECOM01-0368', 'OC-0786', 990, date '2026-08-31', 3.6, 'MULTI COLLAGEN COMPLEX FOR WOMEN 240CAP COLAGENO EN CAPSULAS MICROINGREDIENTS'),
  (125, 'ECOM01-0297', 'OC-0656', 1008, date '2026-06-12', 3.86, 'MULTI COLLAGEN PEPTIDES 454G MULTI COLAGENO EN POLVO'),
  (125, 'ECOM01-0332', 'OC-0701', 1000, date '2026-06-30', 3.89, 'MULTI COLLAGEN PEPTIDES 454G MULTI COLAGENO EN POLVO'),
  (127, 'ECOM01-0174', 'OC-0390', 1008, date '2026-03-07', 1.96, 'NAD ADVANCE CATA KOR'),
  (127, 'ECOM01-0248', 'OC-0556', 1008, date '2026-05-05', 2.03, 'NAD ADVANCE CATA KOR'),
  (127, 'ECOM01-0360', 'OC-0736', 1008, date '2026-07-30', 2.0, 'NAD ADVANCE CATA KOR'),
  (128, 'PA-00167', 'OC-0182', 700, date '2025-08-19', 8.05, 'NAD RESVERATROL REUS RESEARCH 900MG 80 CAPSULAS'),
  (128, 'ECOM01-0049', 'OC-0250', 1000, date '2025-11-20', 7.0, 'NAD RESVERATROL REUS RESEARCH 900MG 80 CAPSULAS'),
  (128, 'ECOM01-0134', 'OC-0352', 1000, date '2026-02-06', 3.1, 'NAD RESVERATROL REUS RESEARCH 900MG 80 CAPSULAS'),
  (128, 'ECOM01-0245', 'OC-0520', 1035, date '2026-05-05', 2.99, 'NAD RESVERATROL REUS RESEARCH 900MG 80 CAPSULAS'),
  (128, 'ECOM01-0355', 'OC-0739', 1035, date '2026-07-30', 2.88, 'NAD RESVERATROL REUS RESEARCH 900MG 80 CAPSULAS'),
  (129, 'ECOM01-0342', 'OC-0714', 2010, date '2026-08-04', 4.68, 'NAD 1000MG NICOTINAMIDE'),
  (130, 'ECOM01-0366', 'OC-0782', 1025, date '2026-08-31', 1.72, 'NMN NAD SUPPORT'),
  (302, 'ECOM01-0388', 'OC-0909', 984, date '2026-10-19', 0.965447, 'OCEAURA COLLAGEN LIFTING BODY OIL'),
  (132, 'ECOM01-0052', 'OC-0261', 1000, date '2025-11-20', 1.88, 'OXIDO NITRICO 60 CAPSULAS'),
  (132, 'ECOM01-0117', 'OC-0329', 1000, date '2026-01-22', 1.87, 'OXIDO NITRICO 60 CAPSULAS'),
  (132, 'ECOM01-0157', 'OC-0389', 1000, date '2026-02-20', 1.87, 'OXIDO NITRICO 60 CAPSULAS'),
  (134, 'ECOM01-0351', 'OC-0774', 2304, date '2026-08-04', 1.51, 'PETER THOMAS ROTH'),
  (135, 'ECOM01-0102', 'OC-0323', 1000, date '2026-01-08', 0.78, 'PARCHE KINOKI'),
  (137, 'PA-00171', 'OC-0119', 576, date '2025-10-30', 1.63, 'PERFUME DE FEROMONAS ALLURE HER 50ML'),
  (137, 'ECOM01-0142', 'OC-0340', 960, date '2026-02-20', 1.06, 'PERFUME DE FEROMONAS ALLURE HER 50ML'),
  (138, 'ECOM01-0096', 'OC-0317', 1000, date '2026-01-08', 3.81, 'PERFUME DE PHEROMONAS HER LOSS 50ML'),
  (138, 'ECOM01-0188', 'OC-0427', 1000, date '2026-03-23', 3.81, 'PERFUME DE PHEROMONAS HER LOSS 50ML'),
  (138, 'ECOM01-0243', 'OC-0528', 1000, date '2026-05-05', 3.96, 'PERFUME DE PHEROMONAS HER LOSS 50ML'),
  (138, 'ECOM01-0302', 'OC-0622', 1000, date '2026-07-06', 3.67, 'PERFUME DE PHEROMONAS HER LOSS 50ML'),
  (138, 'ECOM01-0339', 'OC-0723', 1000, date '2026-08-12', 3.57, 'PERFUME DE PHEROMONAS HER LOSS 50ML'),
  (139, 'PA-00158', 'OC-0170', 1000, date '2025-06-18', 0.995, 'PLANTILLAS AZULES'),
  (139, 'ECOM01-0076', 'OC-0287', 400, date '2026-01-08', 1.27, 'PLANTILLAS AZULES'),
  (140, 'ECOM01-0083', 'OC-0299', 500, date '2026-01-08', 1.35, 'PLANTILLAS COMODAS MEMORY FOAM VERDES'),
  (141, 'PA-00143', 'OC-0155', 1000, date '2025-04-28', 0.93, 'POLVO DENTAL TEETH RESTORATION'),
  (141, 'ECOM01-0026', 'OC-0251', 1000, date '2025-11-18', 0.94, 'POLVO DENTAL TEETH RESTORATION'),
  (141, 'ECOM01-0285', 'OC-0614', 1080, date '2026-05-27', 1.01, 'POLVO DENTAL TEETH RESTORATION'),
  (143, 'ECOM01-0176', 'OC-0410', 1899, date '2026-04-24', 0.94, 'PROTECTOR DENTAL ORALHOE'),
  (143, 'ECOM01-0352', 'OC-0787', 1942, date '2026-08-04', 0.96, 'PROTECTOR DENTAL ORALHOE'),
  (542, 'ECOM01-0410', 'OC-0961', 513, date '2026-11-20', 5.21, 'REPOSABRAZOS DE CUERO PARA CARRO'),
  (145, 'ECOM01-0263', 'OC-0533', 1000, date '2026-05-19', 2.49, 'RYZE CAFE EN POLVO CON HONGOS'),
  (591, 'ECOM01-0407', 'OC-0903', 1920, date '2026-11-23', 1.49, 'RELIEVE SCIATICA GREVIP 120CAP'),
  (131, 'ECOM01-0180', 'OC-0430', 1000, date '2026-03-23', 6.58, 'REMOLACHA ORGANIC BEET ROOT BIYODE 40 CHEWS'),
  (147, 'ECOM01-0025', 'OC-0253', 400, date '2025-10-28', 2.32, 'REPELENTE MULTIFUNCION ULTRASONICO'),
  (147, 'ECOM01-0198', 'OC-0426', 400, date '2026-03-23', 1.15, 'REPELENTE MULTIFUNCION ULTRASONICO'),
  (148, 'ECOM01-0184', 'OC-0393', 960, date '2026-03-23', 1.54, 'RHODIOLA ROSEA 60CAP'),
  (149, 'ECOM01-0064', 'OC-0284', 500, date '2025-12-23', 5.92, 'ROCIADOR DE BIDE'),
  (1206, 'PA-00051', 'OC-0050', 50, date '2024-02-02', null, 'RODILLERA COBREVIDA'),
  (151, 'PA-0001', 'OC-0011', 500, date '2023-12-15', null, 'ROLLOS PARA IMPRESORA BROTHER'),
  (151, 'ECOM01-0138', 'OC-0350', 500, date '2026-02-11', 2.76, 'ROLLOS PARA IMPRESORA BROTHER'),
  (151, 'ECOM01-0350', 'OC-0770', 500, date '2026-08-04', 2.82, 'ROLLOS PARA IMPRESORA BROTHER'),
  (152, 'ECOM01-0372', 'OC-0874', 522, date '2026-09-25', 4.264368, 'ROLLOS PARA IMPRESORA ZEBRA DK11247'),
  (153, 'ECOM01-0046', 'OC-0238', 1000, date '2025-11-20', 1.58, 'SEAPURI TRATAMIENTO CAPILAR'),
  (154, 'ECOM01-0185', 'OC-0394', 960, date '2026-03-23', 1.54, 'SELERB NAD MEN S COMPLEX'),
  (154, 'ECOM01-0230', 'OC-0523', 960, date '2026-05-05', 1.58, 'SELERB NAD MEN S COMPLEX'),
  (154, 'ECOM01-0304', 'OC-0629', 960, date '2026-07-06', 1.56, 'SELERB NAD MEN S COMPLEX'),
  (154, 'ECOM01-0354', 'OC-0733', 960, date '2026-07-30', 1.56, 'SELERB NAD MEN S COMPLEX'),
  (154, 'ECOM01-0374', 'OC-0734', 960, date '2026-09-25', 1.416667, 'SELERB NAD MEN S COMPLEX'),
  (155, 'ECOM01-0257', 'OC-0573', 300, date '2026-05-05', 2.13, 'SELLADOR IMPERMEABILIZANTE INVISIBLE'),
  (155, 'ECOM01-0387', 'OC-0893', 300, date '2026-10-19', 1.833333, 'SELLADOR IMPERMEABILIZANTE INVISIBLE'),
  (157, 'PA-00173', 'OC-0191', 576, date '2025-10-30', 1.04, 'SERUM ANTIEDAD REVITAPEPTIDE'),
  (156, 'ECOM01-0192', 'OC-0418', 960, date '2026-03-23', 1.46, 'SERUM DE VITAMINA CAPILAR'),
  (158, 'PA-00172', 'OC-0188', 150, date '2025-08-26', 5.68, 'SET BANDA DE EJERCICIO ROSA 5 PIEZAS CON LA BANDA DE PEDALES'),
  (159, 'ECOM01-0023', 'OC-0236', 900, date '2025-11-18', 1.89, 'SET DE PESTANAS MAGNETICAS'),
  (160, 'ECOM01-0222', 'OC-0512', 1944, date '2026-04-24', 1.55, 'SHAMPOO ANTICASPA HOEGOA'),
  (162, 'ECOM01-0097', 'OC-0303', 1000, date '2026-01-08', 5.8, 'SHE LAJIT HONEY SABOR A FRESA 30 STICKS'),
  (162, 'ECOM01-0337', 'OC-0719', 512, date '2026-08-12', 4.6875, 'SHE LAJIT HONEY SABOR A FRESA 30 STICKS'),
  (163, 'PA-00170', 'OC-0116', 600, date '2025-08-05', null, 'SHILAJIT 50G RESINA PURA'),
  (163, 'PA-00190', 'OC-0233', 600, date '2025-10-21', 2.9, 'SHILAJIT 50G RESINA PURA'),
  (163, 'ECOM01-0034', 'OC-0259', 600, date '2025-11-18', 3.2, 'SHILAJIT 50G RESINA PURA'),
  (163, 'ECOM01-0051', 'OC-0272', 572, date '2025-11-20', 3.17, 'SHILAJIT 50G RESINA PURA'),
  (163, 'ECOM01-0098', 'OC-0302', 600, date '2026-01-08', 3.2, 'SHILAJIT 50G RESINA PURA'),
  (163, 'ECOM01-0417', 'OC-1102', 300, date '2026-11-20', 2.95, 'SHILAJIT 50G RESINA PURA'),
  (165, 'ECOM01-0250', 'OC-0531', 1920, date '2026-05-05', 1.82, 'SHILAJIT ULTRA VERDE'),
  (165, 'ECOM01-0320', 'OC-0630', 960, date '2026-06-18', 1.81, 'SHILAJIT ULTRA VERDE'),
  (165, 'ECOM01-0353', 'OC-0732', 960, date '2026-07-30', 1.81, 'SHILAJIT ULTRA VERDE'),
  (166, 'ECOM01-0017', 'OC-0224', 1000, date '2025-10-21', 1.69, 'SHILAJIT EN CAPSULA 8 EN 1'),
  (166, 'ECOM01-0091', 'OC-0304', 1000, date '2026-01-08', 1.89, 'SHILAJIT EN CAPSULA 8 EN 1'),
  (166, 'ECOM01-0118', 'OC-0342', 1000, date '2026-01-22', 1.9, 'SHILAJIT EN CAPSULA 8 EN 1'),
  (166, 'ECOM01-0319', 'OC-0623', 960, date '2026-06-18', 1.83, 'SHILAJIT EN CAPSULA 8 EN 1'),
  (167, 'ECOM01-0029', 'OC-0254', 1000, date '2025-11-18', 1.25, 'SKIN FIRMING HOYGI'),
  (167, 'ECOM01-0296', 'OC-0634', 480, date '2026-06-12', 1.82, 'SKIN FIRMING HOYGI'),
  (297, 'ECOM01-0082', 'OC-0290', 500, date '2026-01-08', 4.69, 'SOPORTE DE CUELLO ANTIRONQUIDOS'),
  (292, 'ECOM01-0389', 'OC-0917', 1950, date '2026-10-19', 0.707692, 'SOUTH MOON LIPOMA REMOVAL SPRAY 50ML'),
  (168, 'ECOM01-0011', 'OC-0220', 1000, date '2025-10-22', 1.47, 'SPRAY BEE VENOM PARA ELIMINAR VERRUGAS'),
  (168, 'ECOM01-0086', 'OC-0306', 990, date '2026-01-08', 1.41, 'SPRAY BEE VENOM PARA ELIMINAR VERRUGAS'),
  (168, 'ECOM01-0310', 'OC-0626', 500, date '2026-06-12', 1.39, 'SPRAY BEE VENOM PARA ELIMINAR VERRUGAS'),
  (169, 'ECOM01-0175', 'OC-0397', 1000, date '2026-04-24', 2.33, 'SPRAY DR MELAXIN PEEL SHOT 200ML'),
  (169, 'ECOM01-0313', 'OC-0628', 999, date '2026-06-18', 2.31, 'SPRAY DR MELAXIN PEEL SHOT 200ML'),
  (169, 'ECOM01-0327', 'OC-0699', 1000, date '2026-06-30', 2.31, 'SPRAY DR MELAXIN PEEL SHOT 200ML'),
  (169, 'ECOM01-0346', 'OC-0747', 1000, date '2026-08-04', 2.31, 'SPRAY DR MELAXIN PEEL SHOT 200ML'),
  (170, 'ECOM01-0013', 'OC-0222', 1000, date '2025-10-22', 1.19, 'SPRAY PARA CICATRICES SOUTH MON 20G'),
  (170, 'ECOM01-0085', 'OC-0305', 1000, date '2026-01-08', 1.11, 'SPRAY PARA CICATRICES SOUTH MON 20G'),
  (557, 'ECOM01-0438', 'OC-0949', 1200, date '2026-10-31', 0.62, 'SUMIFUN ALOPECIA HAIR GROWTH CREAM 20G CREMA PARA ALOPECIA CRECIMIENTO CAPILAR'),
  (551, 'ECOM01-0413', 'OC-0926', 1000, date '2026-11-23', 2.58, 'SUPLEMENTO HAPPY CLEANER 14 DAYS'),
  (172, 'PA-00183', 'OC-0215', 300, date '2025-09-01', 4.71, 'TABLA DE CORTAR TITANWARE 100 TITANIO PURO'),
  (172, 'ECOM01-0061', 'OC-0282', 300, date '2025-12-23', 5.21, 'TABLA DE CORTAR TITANWARE 100 TITANIO PURO'),
  (172, 'ECOM01-0341', 'OC-0617', 300, date '2026-08-12', 5.066667, 'TABLA DE CORTAR TITANWARE 100 TITANIO PURO'),
  (173, 'ECOM01-0136', 'OC-0343', 972, date '2026-02-11', 0.82, 'TALLOW HONEY BALM'),
  (173, 'ECOM01-0235', 'OC-0491', 972, date '2026-05-05', 1.58, 'TALLOW HONEY BALM'),
  (173, 'ECOM01-0314', 'OC-0638', 972, date '2026-06-18', 1.55, 'TALLOW HONEY BALM'),
  (519, 'ECOM01-0384', 'OC-0855', 500, date '2026-11-17', 1.3, 'TAPETE PROTECTOR DE GRIFO CON BANDEJA ANTIGOTEO'),
  (174, 'ECOM01-0059', 'OC-0274', 1000, date '2025-12-23', 0.94, 'TINNIDROP SPRAY PARA EL OIDO'),
  (174, 'ECOM01-0295', 'OC-0627', 1010, date '2026-06-12', 0.89, 'TINNIDROP SPRAY PARA EL OIDO'),
  (176, 'ECOM01-0043', 'OC-0252', 1008, date '2025-11-20', 2.9, 'TONICO PARA DEPILACION TRULY GLAZED DONUT'),
  (176, 'ECOM01-0159', 'OC-0375', 1008, date '2026-02-20', 2.68, 'TONICO PARA DEPILACION TRULY GLAZED DONUT'),
  (176, 'ECOM01-0292', 'OC-0608', 1008, date '2026-06-12', 2.52, 'TONICO PARA DEPILACION TRULY GLAZED DONUT'),
  (178, 'ECOM01-0234', 'OC-0544', 1008, date '2026-05-05', 2.79, 'TRULY BUNS OF GLOWRY'),
  (179, 'ECOM01-0255', 'OC-0546', 1040, date '2026-05-05', 2.74, 'TRULY CREMA COCO CLOUD'),
  (180, 'ECOM01-0254', 'OC-0545', 1008, date '2026-05-05', 2.77, 'TRULY JELLY BOOSTER AZUL 90ML'),
  (181, 'ECOM01-0120', 'OC-0345', 1008, date '2026-01-14', 2.68, 'TRULY SMOOTH LEGEND'),
  (181, 'ECOM01-0233', 'OC-0470', 1008, date '2026-05-05', 2.78, 'TRULY SMOOTH LEGEND'),
  (181, 'ECOM01-0307', 'OC-0609', 1008, date '2026-06-12', 2.52, 'TRULY SMOOTH LEGEND'),
  (182, 'ECOM01-0033', 'OC-0246', 1000, date '2025-11-18', 2.53, 'TURKESTERONE'),
  (182, 'ECOM01-0087', 'OC-0312', 1000, date '2026-01-08', 2.54, 'TURKESTERONE'),
  (182, 'ECOM01-0130', 'OC-0353', 1000, date '2026-02-06', 2.53, 'TURKESTERONE'),
  (182, 'ECOM01-0317', 'OC-0612', 1000, date '2026-06-18', 2.51, 'TURKESTERONE'),
  (182, 'ECOM01-0330', 'OC-0633', 1000, date '2026-06-30', 2.57, 'TURKESTERONE'),
  (183, 'ECOM01-0053', 'OC-0262', 1000, date '2025-11-20', 2.84, 'TURMERIC CURCUMIN'),
  (183, 'ECOM01-0261', 'OC-0526', 500, date '2026-05-19', 2.93, 'TURMERIC CURCUMIN'),
  (185, 'ECOM01-0014', 'OC-0232', 1000, date '2025-10-21', 3.13, 'TONICO PARA DEPILACION TRULY SOFT SERVE'),
  (185, 'PA-00188', 'OC-0212', 920, date '2025-10-23', 3.41, 'TONICO PARA DEPILACION TRULY SOFT SERVE'),
  (185, 'ECOM01-0044', 'OC-0268', 1920, date '2025-11-20', 2.510417, 'TONICO PARA DEPILACION TRULY SOFT SERVE'),
  (185, 'ECOM01-0126', 'OC-0327', 2003, date '2026-02-06', 2.68, 'TONICO PARA DEPILACION TRULY SOFT SERVE'),
  (185, 'ECOM01-0158', 'OC-0384', 1008, date '2026-02-20', 2.66, 'TONICO PARA DEPILACION TRULY SOFT SERVE'),
  (185, 'ECOM01-0308', 'OC-0625', 1008, date '2026-06-12', 2.52, 'TONICO PARA DEPILACION TRULY SOFT SERVE'),
  (185, 'ECOM01-0328', 'OC-0639', 1008, date '2026-06-30', 2.75, 'TONICO PARA DEPILACION TRULY SOFT SERVE'),
  (186, 'ECOM01-0119', 'OC-0300', 1008, date '2026-01-14', 2.68, 'TONICO PARA DEPILACION TRULY UNICORN FRUIT'),
  (186, 'ECOM01-0160', 'OC-0374', 1008, date '2026-02-20', 2.68, 'TONICO PARA DEPILACION TRULY UNICORN FRUIT'),
  (186, 'ECOM01-0291', 'OC-0607', 1008, date '2026-06-12', 2.52, 'TONICO PARA DEPILACION TRULY UNICORN FRUIT'),
  (186, 'ECOM01-0348', 'OC-0751', 1008, date '2026-08-04', 2.75, 'TONICO PARA DEPILACION TRULY UNICORN FRUIT'),
  (187, 'PA-00169', 'OC-0186', 1000, date '2025-08-05', 1.45, 'URO PROBIOTIC'),
  (187, 'ECOM01-0057', 'OC-0276', 1575, date '2025-12-23', 1.63, 'URO PROBIOTIC'),
  (187, 'ECOM01-0259', 'OC-0485', 960, date '2026-05-19', 1.68, 'URO PROBIOTIC'),
  (187, 'ECOM01-0303', 'OC-0621', 1125, date '2026-07-06', 1.6, 'URO PROBIOTIC'),
  (188, 'ECOM01-0074', 'OC-0291', 984, date '2026-01-08', 1.27, 'VARICOX VEIN BEE VENOM SPRAY 30ML'),
  (188, 'ECOM01-0284', 'OC-0538', 954, date '2026-05-27', 1.09, 'VARICOX VEIN BEE VENOM SPRAY 30ML'),
  (188, 'ECOM01-0294', 'OC-0601', 954, date '2026-06-12', 0.97, 'VARICOX VEIN BEE VENOM SPRAY 30ML'),
  (497, 'ECOM01-0381', 'OC-0852', 500, date '2026-09-25', 5.9, 'VENTILADOR PORTATIL MF019 MINI'),
  (189, 'ECOM01-0244', 'OC-0534', 1000, date '2026-05-05', 2.89, 'VINAGRE DE MANZANA EN CAPSULAS'),
  (190, 'ECOM01-0219', 'OC-0415', 1000, date '2026-04-14', 1.88, 'VITAMINA LIQUIDA B12 B6 B1 NIACIN FOLATE'),
  (190, 'ECOM01-0260', 'OC-0525', 1000, date '2026-05-19', 1.94, 'VITAMINA LIQUIDA B12 B6 B1 NIACIN FOLATE'),
  (190, 'ECOM01-0331', 'OC-0682', 1000, date '2026-06-30', 1.94, 'VITAMINA LIQUIDA B12 B6 B1 NIACIN FOLATE'),
  (190, 'ECOM01-0375', 'OC-0709', 1040, date '2026-09-25', 1.836538, 'VITAMINA LIQUIDA B12 B6 B1 NIACIN FOLATE'),
  (191, 'ECOM01-0193', 'OC-0419', 1008, date '2026-03-23', 1.58, 'WALL MOLD REMOVER FIELL'),
  (281, 'ECOM01-0439', 'OC-0932', 2100, date '2026-10-31', 0.86, 'XIMONTH HERBAL HEMORRHOID CREAM 20G CREMA DE HIERBAS PARA LAS HEMORROIDES'),
  (192, 'ECOM01-0056', 'OC-0264', 594, date '2025-12-23', 4.67, 'YERBA MAGIC PEACH MANGO 30 SERVING'),
  (192, 'ECOM01-0221', 'OC-0424', 997, date '2026-04-14', 4.17, 'YERBA MAGIC PEACH MANGO 30 SERVING'),
  (192, 'ECOM01-0298', 'OC-0611', 1000, date '2026-06-12', 3.78, 'YERBA MAGIC PEACH MANGO 30 SERVING')),
x as (
  select v.*, s.id as sku_id, s.nombre, s.codigo as sku_codigo,
    (select c.id from wms_compras c join paises p on p.id = c.pais_id and p.codigo = 'PA' where c.codigo = v.ecom and c.anulada_en is null order by c.creado_en limit 1) as compra_id
  from v join skus_maestros s on s.numero = v.numero
),
y as (
  select x.*,
    (select i.costo_unitario from wms_compra_items i where i.compra_id = x.compra_id and i.sku_maestro_id = x.sku_id) as unitario_item,
    (select c.monto_total / nullif(c.qty_total, 0) from wms_compras c where c.id = x.compra_id and c.sku_maestro_id = x.sku_id
      and not exists (select 1 from wms_compra_items i where i.compra_id = c.id)) as unitario_compra,
    (select l.producto_clave from fin_costos_lotes l where l.sku_maestro_id = x.sku_id order by l.creado_en limit 1) as clave_previa
  from x
)
insert into fin_costos_lotes (
  hoja, fila, linea, fecha_llegada, producto, producto_clave, codigo, sku_maestro_id, cantidad, costo_unitario,
  financiamiento, costo_total, estatus, origen, origen_clave, en_hoja_costos, compra_id, costo_final_manual, costo_final_excel, asoc_nota
)
select 'Costos de producto', 0, y.ecom, y.llegada, y.nombre, coalesce(y.clave_previa, y.clave), y.sku_codigo, y.sku_id, y.unidades,
  round(coalesce(nullif(y.unitario_item, 0), nullif(y.unitario_compra, 0), y.final), 6),
  0, coalesce(y.final, round(coalesce(nullif(y.unitario_item, 0), nullif(y.unitario_compra, 0)), 6)),
  'Carga inicial', case when y.compra_id is null then 'carga_inicial' else 'compras' end,
  case when y.compra_id is null then 'carga:' || y.numero || ':' || y.ecom else 'compra:' || y.compra_id || ':' || y.sku_id end,
  true, y.compra_id, y.final, y.final is not null,
  case when y.final is not null then 'Carga inicial: costo final del Excel de María José (26 nov 2026). Al desglosar los costos asociados, quitar el costo final.' end
from y
where coalesce(y.final, nullif(y.unitario_item, 0), nullif(y.unitario_compra, 0)) > 0
on conflict (origen_clave) do update set
  en_hoja_costos = true,
  compra_id = excluded.compra_id,
  costo_final_manual = coalesce(fin_costos_lotes.costo_final_manual, excluded.costo_final_manual),
  costo_final_excel = fin_costos_lotes.costo_final_manual is null and excluded.costo_final_excel,
  asoc_nota = coalesce(fin_costos_lotes.asoc_nota, excluded.asoc_nota),
  estatus = coalesce(fin_costos_lotes.estatus, excluded.estatus)
  where not fin_costos_lotes.en_hoja_costos;

-- Los 24 productos con stock sin compra vinculada (pestaña «Sin compra vinculada» del mismo Excel): no tienen fila; la hoja
-- los muestra como alerta «Con stock y sin costo» hasta que María José les cargue el costo a mano.
insert into fin_config (clave, valor)
select 'costos_sin_compra', to_jsonb(array_agg(numero order by numero)) from (values
  (1516, 'AFEITADORA/ELECTRICA/DOBLE/ROSADO'),
  (1517, 'AFEITADORA/ELECTRICA/DOBLE/TURQUESA'),
  (18, 'ANUA/NIACINAMIDE/SERUM'),
  (19, 'ANUA/PEACH/SERUM'),
  (1364, 'BOLSAS/BURBUJAS/15X24'),
  (38, 'BOLSO/NAYLA/GRAN/PURPURA'),
  (39, 'BOLSO/NAYLA/GRAN/VERDE'),
  (1482, 'CARGADOR/TELEFONO/NEGRO'),
  (1483, 'CARGADOR/TELEFONO/PLATEADO'),
  (61, 'CREMA/REMOVEDOR/VERRUGAS'),
  (1168, 'MAGNESIUM/COMPLEX/60CAPSULAS'),
  (1539, 'MAQUINA/AFEITAR/AZUL'),
  (1538, 'MAQUINA/AFEITAR/ROSA'),
  (117, 'MEDIAS/SOPORTE/CALCETINES'),
  (881, 'MYO/CHIRO/INOSITOL'),
  (133, 'OXIDO/NITRICO/TAPA'),
  (1531, 'PULSERA/MAGNETICA/COBRE'),
  (144, 'PURIFYNG/GEL/EXFOLIANTE'),
  (1628, 'RODILLERA/DEPORTIVA/VARILLAS/L'),
  (1627, 'RODILLERA/DEPORTIVA/VARILLAS/M'),
  (1629, 'RODILLERA/DEPORTIVA/VARILLAS/XL'),
  (175, 'TOBILLERA/COMPRESION/BLANCO'),
  (184, 'TONICO/HOJA/CORAZON'),
  (177, 'TRUE/FEM/BALANCE')) as s(numero, sku)
on conflict (clave) do update set valor = excluded.valor;

-- Quienes llenan la hoja (María José y Francis) pueden modificar Costos de producto, como permiso propio (si ya lo tenían de
-- solo lectura, pasa a edición). Si su nombre no coincide, se les da en Usuarios y roles.
insert into permisos_persona (perfil_id, modulo, nivel)
select p.id, 'costos-mercancia', 'edicion' from perfiles p
where p.activo and (
  translate(lower(coalesce(p.nombre, '')), 'áéíóú', 'aeiou') like 'maria jose%'
  or lower(coalesce(p.nombre, '')) like 'francis%'
)
on conflict (perfil_id, modulo) do update set nivel = 'edicion';

-- Para revisar: lo que quedó en la hoja y lo que del Excel no se encontró (código único o compra).
select count(*) filter (where en_hoja_costos) as filas_hoja,
       count(distinct sku_maestro_id) filter (where en_hoja_costos) as productos_hoja,
       count(*) filter (where en_hoja_costos and compra_id is null) as sin_compra_enlazada,
       count(*) filter (where en_hoja_costos and costo_final_manual is null) as sin_costo_final
from fin_costos_lotes;

-- Quién puede llenar la hoja (permiso propio de Costos de producto en edición).
select coalesce(p.nombre, p.email) as edita_costos from permisos_persona pp join perfiles p on p.id = pp.perfil_id
where pp.modulo = 'costos-mercancia' and pp.nivel = 'edicion';
