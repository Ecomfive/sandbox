-- Testing Lab (pedido de Hernán, 14 oct 2026). Necesita la 0104 (Selección de productos) y la 0105 (Scraping de proveedores).
-- * Selección de productos: los estados pasan a Seleccionado → Crear oferta → Descartado («Por evaluar» se quita: lo que
--   llega de una fuente ya viene seleccionado). Un descarte guarda su motivo (p. ej. «Ya testeado: …»). Una fila que vino de
--   Scraping de proveedores guarda de qué producto salió y su precio en la moneda del proveedor.
-- * wms_seleccion_ofertas: de 1 a 3 ofertas por producto en «Crear oferta» (nombre, unidades y precio en dólares).
-- * tipos_cambio: cuántas unidades de cada moneda vale 1 dólar, una fila por día (se lee sola de un servicio público).
-- * scraping_productos.foto_huella: la huella de la foto (dHash), para cruzar con Producto y entre proveedores.
-- Se puede repetir.

update wms_seleccion_productos set estado = 'seleccionado' where estado = 'por_evaluar';
alter table wms_seleccion_productos drop constraint if exists wms_seleccion_productos_estado_check;
alter table wms_seleccion_productos add constraint wms_seleccion_productos_estado_check check (estado in ('seleccionado', 'crear_oferta', 'descartado'));
alter table wms_seleccion_productos alter column estado set default 'seleccionado';
alter table wms_seleccion_productos add column if not exists motivo_descarte text;
alter table wms_seleccion_productos add column if not exists scraping_producto_id uuid references scraping_productos(id) on delete set null;
alter table wms_seleccion_productos add column if not exists precio_original numeric(14, 2);
alter table wms_seleccion_productos add column if not exists moneda_original text;
create unique index if not exists wms_seleccion_productos_scraping_uidx on wms_seleccion_productos (scraping_producto_id) where scraping_producto_id is not null;

create table if not exists wms_seleccion_ofertas (
  id uuid primary key default uuid_v7(),
  seleccion_id uuid not null references wms_seleccion_productos(id) on delete cascade,
  orden smallint not null check (orden between 1 and 3),
  nombre text not null,
  unidades integer not null default 1 check (unidades between 1 and 99),
  precio numeric(12, 2) check (precio is null or precio >= 0),
  notas text,
  creado_por uuid references perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (seleccion_id, orden)
);
alter table wms_seleccion_ofertas enable row level security;

create table if not exists tipos_cambio (
  fecha date not null,
  moneda text not null,
  por_usd numeric(18, 6) not null check (por_usd > 0),
  fuente text,
  creado_en timestamptz not null default now(),
  primary key (fecha, moneda)
);
alter table tipos_cambio enable row level security;

alter table scraping_productos add column if not exists foto_huella text;
