-- Investigación › Análisis de competencia (pedido de Hernán, 14 oct 2026): todo el catálogo de Dropi de un país (hoy Panamá)
-- leído con una cuenta de dropshipper, comparado con lo que vende ECOMFIVE (nuestro proveedor en ese Dropi) por nombre y por
-- foto. Cada búsqueda anota todo cambio (precio, stock, aparece, desaparece) y deja alertas en la misma sección.
-- * competencia_busquedas: cada lectura del catálogo, con su duración.
-- * competencia_productos: cada producto visto, con su proveedor, último precio y stock, si es nuestro y, si es de la
--   competencia, a cuál de los nuestros es igual (`igual_a`, por nombre o por foto).
-- * competencia_historial: una fila por producto en cada búsqueda en que cambió algo (o la primera vez).
-- * competencia_alertas: lo que pide atención (bajó precio, vende más barato, bajó stock, nuevo que no tenemos,
--   competidor nuevo, desapareció), con `vista` para marcarla leída.
-- Los llena scripts/scraping-proveedores.ts (el mismo receptor de Scraping de proveedores). RLS sin políticas.
-- Se puede repetir.

insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'analisis-competencia', solo_lectura from permisos_rol where modulo = 'inteligencia-competitiva'
on conflict (rol_id, modulo) do nothing;

create table if not exists competencia_busquedas (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  inicio timestamptz not null default now(),
  fin timestamptz,
  estado text not null default 'corriendo' check (estado in ('pendiente', 'corriendo', 'lista', 'fallida')),
  productos integer,
  proveedores integer,
  nuevos integer,
  cambios integer,
  alertas integer,
  duracion_ms integer,
  detalle text
);
create index if not exists competencia_busquedas_pais_idx on competencia_busquedas (pais_id, inicio desc);

create table if not exists competencia_productos (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  dropi_producto_id bigint not null,
  proveedor_dropi_id bigint not null,
  proveedor_nombre text not null,
  sku text,
  nombre text not null,
  foto_url text,
  foto_huella text,
  precio numeric(14, 2),
  precio_sugerido numeric(14, 2),
  stock integer,
  categoria text,
  creado_en_dropi timestamptz,
  es_nuestro boolean not null default false,
  estado text not null default 'activo' check (estado in ('activo', 'desaparecido')),
  igual_a uuid references competencia_productos(id) on delete set null,
  igual_parecido numeric(5, 2),
  igual_metodo text check (igual_metodo is null or igual_metodo in ('nombre', 'foto')),
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  unique (pais_id, dropi_producto_id)
);
create index if not exists competencia_productos_pais_idx on competencia_productos (pais_id, estado);
create index if not exists competencia_productos_igual_idx on competencia_productos (igual_a);

create table if not exists competencia_historial (
  id uuid primary key default uuid_v7(),
  producto_id uuid not null references competencia_productos(id) on delete cascade,
  busqueda_id uuid references competencia_busquedas(id) on delete set null,
  fecha timestamptz not null default now(),
  evento text not null check (evento in ('primera_vez', 'precio', 'stock', 'desaparecio', 'reaparecio')),
  precio numeric(14, 2),
  stock integer,
  precio_antes numeric(14, 2),
  stock_antes integer,
  detalle text
);
create index if not exists competencia_historial_prod_idx on competencia_historial (producto_id, fecha desc);
create index if not exists competencia_historial_fecha_idx on competencia_historial (fecha desc);

create table if not exists competencia_alertas (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  busqueda_id uuid references competencia_busquedas(id) on delete set null,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in ('bajo_precio', 'mas_barato', 'bajo_stock', 'nuevo', 'competidor_nuevo', 'desaparecio')),
  producto_id uuid references competencia_productos(id) on delete cascade,
  nuestro_id uuid references competencia_productos(id) on delete set null,
  titulo text not null,
  detalle text,
  vista boolean not null default false
);
create index if not exists competencia_alertas_pais_idx on competencia_alertas (pais_id, fecha desc);

alter table competencia_busquedas enable row level security;
alter table competencia_productos enable row level security;
alter table competencia_historial enable row level security;
alter table competencia_alertas enable row level security;
