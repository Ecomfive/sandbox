-- Investigación › Análisis de competencia con Effi (pedido de Hernán, 6 nov 2026): el catálogo de dropshipping de Effi (`/app/articulo_dropshipping`, solo Costa
-- Rica), que se ve con nuestra propia cuenta de proveedor, comparado con lo nuestro (ECOMFIVE, ID Effi 55868) por nombre y por foto. Las mismas cuatro tablas de
-- 0234 (Drop), aparte de las de Dropi. A diferencia de Dropi y Drop, Effi muestra las ventas de cada artículo: `ventas` guarda esa cifra y el historial anota
-- cuánto subió entre lecturas (evento `ventas`, con la cifra en `stock` y la anterior en `stock_antes`).
-- `effi_clave` identifica cada artículo entre lecturas: el nombre del archivo de su foto, que no cambia; el código que muestra Effi está cifrado y no se sabe si dura.
-- Las llena scripts/competencia-catalogo-guardar.ts (el mismo receptor de Scraping de proveedores). RLS sin políticas. Se puede repetir.
-- Reversa: supabase/rollbacks/0238_rollback.sql

create table if not exists effi_competencia_busquedas (
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
create index if not exists effi_competencia_busquedas_pais_idx on effi_competencia_busquedas (pais_id, inicio desc);

create table if not exists effi_competencia_productos (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  effi_clave text not null,
  codigo text,
  proveedor_effi_id bigint not null,
  proveedor_nombre text not null,
  nombre text not null,
  foto_url text,
  foto_huella text,
  precio numeric(14, 2),
  precio_sugerido numeric(14, 2),
  stock integer,
  ventas integer,
  categoria text,
  es_nuestro boolean not null default false,
  estado text not null default 'activo' check (estado in ('activo', 'desaparecido')),
  igual_a uuid references effi_competencia_productos(id) on delete set null,
  igual_parecido numeric(5, 2),
  igual_metodo text check (igual_metodo is null or igual_metodo in ('nombre', 'foto')),
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  unique (pais_id, effi_clave)
);
create index if not exists effi_competencia_productos_pais_idx on effi_competencia_productos (pais_id, estado);
create index if not exists effi_competencia_productos_igual_idx on effi_competencia_productos (igual_a);

create table if not exists effi_competencia_historial (
  id uuid primary key default uuid_v7(),
  producto_id uuid not null references effi_competencia_productos(id) on delete cascade,
  busqueda_id uuid references effi_competencia_busquedas(id) on delete set null,
  fecha timestamptz not null default now(),
  evento text not null check (evento in ('primera_vez', 'precio', 'stock', 'ventas', 'desaparecio', 'reaparecio')),
  precio numeric(14, 2),
  stock integer,
  precio_antes numeric(14, 2),
  stock_antes integer,
  detalle text
);
create index if not exists effi_competencia_historial_prod_idx on effi_competencia_historial (producto_id, fecha desc);
create index if not exists effi_competencia_historial_fecha_idx on effi_competencia_historial (fecha desc);

create table if not exists effi_competencia_alertas (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  busqueda_id uuid references effi_competencia_busquedas(id) on delete set null,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in ('bajo_precio', 'mas_barato', 'bajo_stock', 'nuevo', 'competidor_nuevo', 'desaparecio')),
  producto_id uuid references effi_competencia_productos(id) on delete cascade,
  nuestro_id uuid references effi_competencia_productos(id) on delete set null,
  titulo text not null,
  detalle text,
  vista boolean not null default false
);
create index if not exists effi_competencia_alertas_pais_idx on effi_competencia_alertas (pais_id, fecha desc);

alter table effi_competencia_busquedas enable row level security;
alter table effi_competencia_productos enable row level security;
alter table effi_competencia_historial enable row level security;
alter table effi_competencia_alertas enable row level security;
