-- Desempeño › Ventas Dropi: la plata de cada producto (pedido de Hernán, 22 oct 2026). Sale de la hoja ÓRDENES del Excel
-- «ECOMFIVE DROPI 2026 DIARIO» que lleva la oficina, con las reglas de su hoja RESUMEN: ganancia (lo que Dropi paga a ECOMFIVE por
-- la orden), comisión B280, coste real (solo entregadas) y descuentos por garantía o indemnización de la guía. Los fletes los paga
-- el dropshipper y no entran. Las órdenes de varios productos se reparten entre ellos (src/lib/publicaciones/dinero.ts). Lo carga
-- scripts/importar-dinero-ventas-dropi.ts; cada carga reemplaza la anterior del país. Se puede repetir.

create table if not exists dropi_ventas_dinero (
  pais_id uuid not null references paises(id),
  dropi_producto_id integer not null,
  -- La fecha de la orden.
  dia date not null,
  entregadas integer not null default 0,
  unidades integer not null default 0,
  ganancia numeric(12, 2) not null default 0,
  comision numeric(12, 2) not null default 0,
  coste numeric(12, 2) not null default 0,
  descuentos numeric(12, 2) not null default 0,
  utilidad numeric(12, 2) generated always as (ganancia - comision - coste - descuentos) stored,
  primary key (pais_id, dropi_producto_id, dia)
);
create index if not exists dropi_ventas_dinero_dia_idx on dropi_ventas_dinero (pais_id, dia);

-- Cada carga: de qué archivo, hasta qué fecha de orden llega y cuántas órdenes se leyeron.
create table if not exists dropi_ventas_dinero_cargas (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  fuente text not null,
  hasta date not null,
  ordenes integer not null,
  cargado_en timestamptz not null default now()
);
create index if not exists dropi_ventas_dinero_cargas_pais_idx on dropi_ventas_dinero_cargas (pais_id, cargado_en desc);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table dropi_ventas_dinero enable row level security;
alter table dropi_ventas_dinero_cargas enable row level security;
