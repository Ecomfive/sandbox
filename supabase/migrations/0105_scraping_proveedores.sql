-- Scraping de proveedores (14 oct 2026, Fuente de datos › Scraping de proveedores): seguimiento de proveedores de Dropi.
-- * scraping_proveedores: el proveedor (nombre, país, enlace e id en Dropi).
-- * scraping_proveedor_registros: órdenes, productos y dropshippers del proveedor en una fecha, para ver si sube o baja.
--   Los escribe la persona (origen 'manual') o los lee cada búsqueda del encabezado de Dropi (origen 'dropi').
-- * scraping_productos: cada producto que se ha visto del proveedor, con su último precio, stock y estado (activo, privado,
--   desaparecido con su motivo) y, si es privado, el producto con foto con el que se vinculó por el nombre.
-- * scraping_producto_historial: una fila por producto en cada búsqueda en que cambió algo (o la primera vez).
-- * scraping_busquedas: cada búsqueda completa, con su duración y lo que encontró.
-- Los llena scripts/scraping-proveedores.ts (recibe lo que se lee en Dropi con la sesión de un dropshipper; Dropi solo
-- muestra los productos publicados con stock). RLS sin políticas: solo el servidor con la clave de servicio.

create table if not exists scraping_proveedores (
  id uuid primary key default uuid_v7(),
  nombre text not null,
  pais text not null default 'mx',
  dropi_url text not null,
  dropi_id bigint,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid references perfiles(id) on delete set null
);
create unique index if not exists scraping_proveedores_url_idx on scraping_proveedores (dropi_url);

create table if not exists scraping_proveedor_registros (
  id uuid primary key default uuid_v7(),
  proveedor_id uuid not null references scraping_proveedores(id) on delete cascade,
  fecha timestamptz not null default now(),
  ordenes integer not null check (ordenes >= 0),
  productos integer not null check (productos >= 0),
  dropshippers integer not null check (dropshippers >= 0),
  origen text not null default 'manual' check (origen in ('manual', 'dropi')),
  creado_por uuid references perfiles(id) on delete set null
);
create index if not exists scraping_proveedor_registros_prov_idx on scraping_proveedor_registros (proveedor_id, fecha desc);

create table if not exists scraping_busquedas (
  id uuid primary key default uuid_v7(),
  proveedor_id uuid not null references scraping_proveedores(id) on delete cascade,
  inicio timestamptz not null default now(),
  fin timestamptz,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'corriendo', 'lista', 'fallida')),
  pedida_por uuid references perfiles(id) on delete set null,
  productos_vistos integer,
  nuevos integer,
  desaparecidos integer,
  cambios_precio integer,
  cambios_stock integer,
  privados integer,
  duracion_ms integer,
  detalle text
);
create index if not exists scraping_busquedas_prov_idx on scraping_busquedas (proveedor_id, inicio desc);

create table if not exists scraping_productos (
  id uuid primary key default uuid_v7(),
  proveedor_id uuid not null references scraping_proveedores(id) on delete cascade,
  dropi_producto_id bigint not null,
  sku text,
  nombre text not null,
  foto_url text,
  privado boolean not null default false,
  precio numeric(14, 2),
  precio_sugerido numeric(14, 2),
  stock integer,
  categoria text,
  creado_en_dropi timestamptz,
  estado text not null default 'activo' check (estado in ('activo', 'desaparecido')),
  motivo_desaparicion text check (motivo_desaparicion is null or motivo_desaparicion in ('agotado', 'privatizado', 'desconocido')),
  vinculado_a uuid references scraping_productos(id) on delete set null,
  vinculo_parecido numeric(5, 2),
  -- true: se vinculó solo (85 % del nombre y 2 palabras en común); false: es una sugerencia para revisar.
  vinculo_seguro boolean not null default false,
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  datos jsonb,
  unique (proveedor_id, dropi_producto_id)
);
create index if not exists scraping_productos_prov_idx on scraping_productos (proveedor_id, estado);

create table if not exists scraping_producto_historial (
  id uuid primary key default uuid_v7(),
  producto_id uuid not null references scraping_productos(id) on delete cascade,
  busqueda_id uuid references scraping_busquedas(id) on delete set null,
  fecha timestamptz not null default now(),
  evento text not null check (evento in ('primera_vez', 'precio', 'stock', 'desaparecio', 'reaparecio', 'privatizado', 'publicado', 'vinculado')),
  precio numeric(14, 2),
  stock integer,
  precio_antes numeric(14, 2),
  stock_antes integer,
  detalle text
);
create index if not exists scraping_producto_historial_prod_idx on scraping_producto_historial (producto_id, fecha desc);

alter table scraping_proveedores enable row level security;
alter table scraping_proveedor_registros enable row level security;
alter table scraping_busquedas enable row level security;
alter table scraping_productos enable row level security;
alter table scraping_producto_historial enable row level security;
