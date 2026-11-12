-- Investigación › Análisis de competencia con Dunamixfy (pedido de Hernán, 11 nov 2026): el Marketplace de dunamixfy.cr (solo Costa Rica), que se ve con una
-- cuenta de DROPSHIPPER (con la de proveedor solo salen nuestros productos), comparado con lo nuestro («Dunamix EF») por nombre y por foto. Las mismas cuatro tablas
-- de 0234 (Drop) y 0239 (Effi), aparte de las de Dropi. Dunamixfy no muestra las ventas: lo vendido sale de lo que baja el stock, como en Dropi y Drop.
-- `dunamixfy_producto_id` es el número del producto en Dunamixfy («#837», `productNumberId`) y `proveedor_dunamixfy_id` el id del proveedor (los nombres son
-- códigos como «Dunamix NS» y pueden cambiar).
-- Las llena scripts/competencia-catalogo-guardar.ts (el mismo receptor de Scraping de proveedores). RLS sin políticas. Se puede repetir.
-- Además, la revisión con IA de los dudosos (0246) acepta la plataforma «dunamixfy».
-- Reversa: supabase/rollbacks/0271_rollback.sql

create table if not exists dunamixfy_competencia_busquedas (
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
create index if not exists dunamixfy_competencia_busquedas_pais_idx on dunamixfy_competencia_busquedas (pais_id, inicio desc);

create table if not exists dunamixfy_competencia_productos (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  dunamixfy_producto_id text not null check (dunamixfy_producto_id ~ '^[0-9]{1,9}$'),
  proveedor_dunamixfy_id text not null,
  proveedor_nombre text not null,
  nombre text not null,
  foto_url text,
  foto_huella text,
  precio numeric(14, 2),
  precio_sugerido numeric(14, 2),
  stock integer,
  categoria text,
  creado_en_dunamixfy timestamptz,
  es_nuestro boolean not null default false,
  estado text not null default 'activo' check (estado in ('activo', 'desaparecido')),
  igual_a uuid references dunamixfy_competencia_productos(id) on delete set null,
  igual_parecido numeric(5, 2),
  igual_metodo text check (igual_metodo is null or igual_metodo in ('nombre', 'foto')),
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  unique (pais_id, dunamixfy_producto_id)
);
create index if not exists dunamixfy_competencia_productos_pais_idx on dunamixfy_competencia_productos (pais_id, estado);
create index if not exists dunamixfy_competencia_productos_igual_idx on dunamixfy_competencia_productos (igual_a);

create table if not exists dunamixfy_competencia_historial (
  id uuid primary key default uuid_v7(),
  producto_id uuid not null references dunamixfy_competencia_productos(id) on delete cascade,
  busqueda_id uuid references dunamixfy_competencia_busquedas(id) on delete set null,
  fecha timestamptz not null default now(),
  evento text not null check (evento in ('primera_vez', 'precio', 'stock', 'desaparecio', 'reaparecio')),
  precio numeric(14, 2),
  stock integer,
  precio_antes numeric(14, 2),
  stock_antes integer,
  detalle text
);
create index if not exists dunamixfy_competencia_historial_prod_idx on dunamixfy_competencia_historial (producto_id, fecha desc);
create index if not exists dunamixfy_competencia_historial_fecha_idx on dunamixfy_competencia_historial (fecha desc);

create table if not exists dunamixfy_competencia_alertas (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  busqueda_id uuid references dunamixfy_competencia_busquedas(id) on delete set null,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in ('bajo_precio', 'mas_barato', 'bajo_stock', 'nuevo', 'competidor_nuevo', 'desaparecio')),
  producto_id uuid references dunamixfy_competencia_productos(id) on delete cascade,
  nuestro_id uuid references dunamixfy_competencia_productos(id) on delete set null,
  titulo text not null,
  detalle text,
  vista boolean not null default false
);
create index if not exists dunamixfy_competencia_alertas_pais_idx on dunamixfy_competencia_alertas (pais_id, fecha desc);

alter table dunamixfy_competencia_busquedas enable row level security;
alter table dunamixfy_competencia_productos enable row level security;
alter table dunamixfy_competencia_historial enable row level security;
alter table dunamixfy_competencia_alertas enable row level security;

-- La revisión con IA de los dudosos (0246) también para Dunamixfy. La restricción se busca por lo que dice, no por su nombre.
do $$
declare c text;
begin
  if to_regclass('competencia_verificaciones') is null then
    return;
  end if;
  for c in select conname from pg_constraint where conrelid = 'competencia_verificaciones'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%plataforma%' loop
    execute format('alter table competencia_verificaciones drop constraint %I', c);
  end loop;
  alter table competencia_verificaciones add constraint competencia_verificaciones_plataforma_check check (plataforma in ('dropi', 'drop', 'effi', 'dunamixfy'));
end $$;
