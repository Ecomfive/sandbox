-- Investigación › Análisis de competencia con Drop (pedido de Hernán, 6 nov 2026): todo el catálogo de Drop (app.soydrop.com, solo Costa Rica) leído con
-- una cuenta de dropshipper, comparado con lo nuestro («Ecomfive Costa Rica») por nombre y por foto. Son las mismas cuatro tablas de 0108, aparte: las
-- `competencia_*` son todas de Dropi y muchos módulos las leen por su ID numérico de Dropi (Tu Winner, Gestión de IDs, la búsqueda general). El ID de un
-- producto de Drop son 24 hexadecimales y su proveedor se conoce por el nombre, que es lo que muestra el catálogo.
-- Las llena scripts/competencia-drop-guardar.ts (el mismo receptor de Scraping de proveedores). RLS sin políticas. Se puede repetir.
-- Reversa: supabase/rollbacks/0234_rollback.sql

create table if not exists drop_competencia_busquedas (
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
create index if not exists drop_competencia_busquedas_pais_idx on drop_competencia_busquedas (pais_id, inicio desc);

create table if not exists drop_competencia_productos (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  drop_producto_id text not null check (drop_producto_id ~ '^[0-9a-f]{24}$'),
  codigo text,
  proveedor_nombre text not null,
  nombre text not null,
  foto_url text,
  foto_huella text,
  precio numeric(14, 2),
  precio_sugerido numeric(14, 2),
  stock integer,
  categoria text,
  creado_en_drop timestamptz,
  es_nuestro boolean not null default false,
  estado text not null default 'activo' check (estado in ('activo', 'desaparecido')),
  igual_a uuid references drop_competencia_productos(id) on delete set null,
  igual_parecido numeric(5, 2),
  igual_metodo text check (igual_metodo is null or igual_metodo in ('nombre', 'foto')),
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  unique (pais_id, drop_producto_id)
);
create index if not exists drop_competencia_productos_pais_idx on drop_competencia_productos (pais_id, estado);
create index if not exists drop_competencia_productos_igual_idx on drop_competencia_productos (igual_a);

create table if not exists drop_competencia_historial (
  id uuid primary key default uuid_v7(),
  producto_id uuid not null references drop_competencia_productos(id) on delete cascade,
  busqueda_id uuid references drop_competencia_busquedas(id) on delete set null,
  fecha timestamptz not null default now(),
  evento text not null check (evento in ('primera_vez', 'precio', 'stock', 'desaparecio', 'reaparecio')),
  precio numeric(14, 2),
  stock integer,
  precio_antes numeric(14, 2),
  stock_antes integer,
  detalle text
);
create index if not exists drop_competencia_historial_prod_idx on drop_competencia_historial (producto_id, fecha desc);
create index if not exists drop_competencia_historial_fecha_idx on drop_competencia_historial (fecha desc);

create table if not exists drop_competencia_alertas (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  busqueda_id uuid references drop_competencia_busquedas(id) on delete set null,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in ('bajo_precio', 'mas_barato', 'bajo_stock', 'nuevo', 'competidor_nuevo', 'desaparecio')),
  producto_id uuid references drop_competencia_productos(id) on delete cascade,
  nuestro_id uuid references drop_competencia_productos(id) on delete set null,
  titulo text not null,
  detalle text,
  vista boolean not null default false
);
create index if not exists drop_competencia_alertas_pais_idx on drop_competencia_alertas (pais_id, fecha desc);

alter table drop_competencia_busquedas enable row level security;
alter table drop_competencia_productos enable row level security;
alter table drop_competencia_historial enable row level security;
alter table drop_competencia_alertas enable row level security;
