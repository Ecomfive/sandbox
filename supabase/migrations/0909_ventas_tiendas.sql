-- Portal AF4 360°: Ventas por tienda (reemplaza la hoja «Excel Matriz» de GESTION_OCEANS_PANAMA.xlsx, ver
-- FINANZAS-360.md). Una orden por tienda Shopify (Oferfy, Nuvo, Kenku, Clicksi, Calzados) con sus líneas de producto,
-- su estado de entrega y de pago, el transportista y lo que costó llevarla.
--
-- De aquí sale la base de reparto del EERR (órdenes y entregadas por tienda y mes, `fin_base_distribucion` con origen
-- «ventas») y el margen bruto por tienda: ventas entregadas − costo de la mercancía (costo vigente de Costos de
-- mercancía, 0121; si el producto no tiene, el costo que trae la Matriz) − envío.
--
-- Datos de la persona que compró (nombre, teléfono, dirección, notas): en su propia tabla, `ven_ordenes_clientes`. Las
-- listas, el resumen y las descargas no la leen; la ficha de una orden los muestra enmascarados.
--
-- RLS activado y sin políticas (ver SEGURIDAD.md): solo el servidor, con la clave de servicio, toca estas tablas.

create table if not exists ven_ordenes (
  id uuid primary key default gen_random_uuid(),
  unidad_id uuid not null references fin_unidades(id),
  numero text not null,
  fecha date not null,
  -- Mes de la orden (por su fecha): es el mes que cuenta el EERR («TOTAL ENVÍOS»).
  periodo date not null check (extract(day from periodo) = 1),
  -- Estado de Shopify (PENDING, PAID, VOIDED, REFUNDED).
  estado_pago text,
  estado_entrega text not null default 'pendiente'
    check (estado_entrega in ('entregada', 'devuelta', 'cancelada', 'no_gestionada', 'en_transito', 'pendiente')),
  metodo_pago text
    check (metodo_pago is null or metodo_pago in ('efectivo', 'yappy', 'transferencia', 'tarjeta', 'servientrega', 'clicksi', 'previo_pago', 'otro')),
  forma_pago_texto text,
  informe_servientrega text,
  transportista text,
  guia text,
  fecha_envio date,
  fecha_devolucion date,
  resultado_courier text,
  subtotal numeric(14, 2) not null default 0,
  envio numeric(14, 2) not null default 0,
  descuento numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0 check (total >= 0),
  moneda text not null default 'USD' check (moneda = 'USD'),
  -- Lo que pagamos por llevarla (repartidor + Servientrega), aunque se haya devuelto.
  costo_envio numeric(14, 2) not null default 0 check (costo_envio >= 0),
  facturado boolean not null default false,
  factura_numero text,
  mes_gestion text,
  motivo_cancelacion text,
  etiquetas text,
  origen text not null default 'manual',
  origen_clave text not null unique,
  huella_contenido text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (unidad_id, numero)
);
create index if not exists ven_ordenes_periodo on ven_ordenes (periodo, unidad_id);
create index if not exists ven_ordenes_estado on ven_ordenes (periodo, estado_entrega);

create table if not exists ven_orden_lineas (
  orden_id uuid not null references ven_ordenes(id) on delete cascade,
  linea smallint not null check (linea > 0),
  producto text not null,
  -- Nombre normalizado: se cruza con `ven_productos_mapeo` y con `fin_costo_vigente`.
  producto_clave text not null,
  cantidad numeric(12, 2) not null default 1 check (cantidad > 0),
  -- La Matriz no trae el precio de cada línea (solo el total de la orden): queda vacío hasta tenerlo de Shopify.
  precio numeric(14, 2),
  sku text,
  sku_maestro_id uuid references skus_maestros(id) on delete set null,
  costo_excel numeric(14, 2) check (costo_excel is null or costo_excel >= 0),
  es_servicio boolean not null default false,
  primary key (orden_id, linea)
);
create index if not exists ven_orden_lineas_producto on ven_orden_lineas (producto_clave);

create table if not exists ven_ordenes_clientes (
  orden_id uuid primary key references ven_ordenes(id) on delete cascade,
  nombre text,
  telefono text,
  direccion text,
  corregimiento text,
  notas text,
  actualizado_en timestamptz not null default now()
);

-- Nombre del producto en la tienda → producto de costo (hoja «BASE COSTO ECOMFIVE», columnas «PRODUCTO MATRIZ …»).
create table if not exists ven_productos_mapeo (
  producto_clave text primary key,
  producto text not null,
  costo_clave text not null,
  origen text not null default 'manual',
  actualizado_en timestamptz not null default now()
);

alter table ven_ordenes enable row level security;
alter table ven_orden_lineas enable row level security;
alter table ven_ordenes_clientes enable row level security;
alter table ven_productos_mapeo enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Costo de cada línea: costo vigente (por el mapeo o por el mismo nombre) × cantidad; si no hay, el de la Matriz.
-- ---------------------------------------------------------------------------------------------
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
    when coalesce(cm.costo_vigente, cd.costo_vigente) is not null then round(l.cantidad * coalesce(cm.costo_vigente, cd.costo_vigente), 2)
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

-- ---------------------------------------------------------------------------------------------
-- Resumen por tienda y mes. Enviadas = entregadas + devueltas + en tránsito. Tasa de entrega = entregadas ÷ enviadas
-- (como el CRM); `tasa_sobre_ordenes` = entregadas ÷ órdenes, que es el «% TASA ENTREGA» de la hoja EERR.
-- ---------------------------------------------------------------------------------------------
create or replace view ven_resumen_mensual
with (security_invoker = true) as
with o as (
  select periodo, unidad_id,
    count(*) as ordenes,
    count(*) filter (where estado_entrega in ('entregada', 'devuelta', 'en_transito')) as enviadas,
    count(*) filter (where estado_entrega = 'entregada') as entregadas,
    count(*) filter (where estado_entrega = 'devuelta') as devueltas,
    count(*) filter (where estado_entrega = 'en_transito') as en_transito,
    count(*) filter (where estado_entrega = 'pendiente') as pendientes,
    count(*) filter (where estado_entrega = 'cancelada') as canceladas,
    count(*) filter (where estado_entrega = 'no_gestionada') as no_gestionadas,
    coalesce(sum(total), 0) as ventas_brutas,
    coalesce(sum(total) filter (where estado_entrega = 'entregada'), 0) as ventas_entregadas,
    coalesce(sum(costo_envio), 0) as costo_envio
  from ven_ordenes
  group by periodo, unidad_id
),
c as (
  select periodo, unidad_id,
    coalesce(sum(costo) filter (where estado_entrega = 'entregada'), 0) as costo_mercancia,
    count(*) filter (where estado_entrega = 'entregada' and not es_servicio) as lineas_producto,
    count(*) filter (where estado_entrega = 'entregada' and costo_fuente = 'costo_vigente') as lineas_costo_vigente,
    count(*) filter (where estado_entrega = 'entregada' and costo_fuente = 'excel') as lineas_costo_excel
  from ven_lineas_costo
  group by periodo, unidad_id
)
select
  o.periodo,
  o.unidad_id,
  o.ordenes,
  o.enviadas,
  o.entregadas,
  o.devueltas,
  o.en_transito,
  o.pendientes,
  o.canceladas,
  o.no_gestionadas,
  round(o.entregadas::numeric / nullif(o.enviadas, 0), 4) as tasa_entrega,
  round(o.entregadas::numeric / nullif(o.ordenes, 0), 4) as tasa_sobre_ordenes,
  round(o.ventas_brutas, 2) as ventas_brutas,
  round(o.ventas_entregadas, 2) as ventas_entregadas,
  round(o.ventas_entregadas / nullif(o.entregadas, 0), 2) as ticket_promedio,
  round(coalesce(c.costo_mercancia, 0), 2) as costo_mercancia,
  round(o.costo_envio, 2) as costo_envio,
  round(o.ventas_entregadas - coalesce(c.costo_mercancia, 0) - o.costo_envio, 2) as margen_bruto,
  coalesce(c.lineas_producto, 0) as lineas_producto,
  coalesce(c.lineas_costo_vigente, 0) as lineas_costo_vigente,
  coalesce(c.lineas_costo_excel, 0) as lineas_costo_excel
from o
left join c on c.periodo = o.periodo and c.unidad_id = o.unidad_id;

comment on table ven_ordenes is 'Portal AF4 360°: órdenes de las tiendas Shopify (reemplaza la hoja «Excel Matriz» de GESTION_OCEANS_PANAMA).';
comment on table ven_ordenes_clientes is 'Datos personales de quien compró: solo los lee la ficha de una orden (enmascarados).';
comment on view ven_resumen_mensual is 'Portal AF4 360°: órdenes, entregas, ventas y margen bruto por tienda y mes; alimenta fin_base_distribucion.';

-- Permiso: lo reciben quienes ya tienen el Libro de movimientos, con su mismo solo lectura.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'ventas-tiendas', solo_lectura
from permisos_rol
where modulo = 'libro-movimientos'
on conflict (rol_id, modulo) do nothing;
