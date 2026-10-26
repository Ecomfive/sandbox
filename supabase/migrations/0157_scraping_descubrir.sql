-- Scraping de proveedores › «Descubrir proveedores» (pedido de Hernán, 26 oct 2026): la extensión «Ecomfive · Dropi» lee todo el
-- catálogo de Dropi de un país (sesión de dropshipper) y el sistema resume por proveedor qué tan interesante es seguirlo: cuánto
-- bajó su stock desde la lectura anterior (ventas estimadas), cuántos productos nuevos publicó en 30 días y cuántos tiene. Aquí
-- queda cada lectura y su resumen; la foto del stock para comparar la próxima vez va en Storage (wms-compras/scraping-catalogo/).
-- Código: src/lib/scraping/descubrir.ts, src/app/(app)/scraping-proveedores/proveedores/. Reversa: supabase/rollbacks/0157_rollback.sql

create table if not exists scraping_descubrir_lecturas (
  id uuid primary key default uuid_v7(),
  pais text not null,
  estado text not null default 'corriendo' check (estado in ('corriendo', 'lista', 'fallida')),
  productos integer,
  proveedores integer,
  -- Si hubo una lectura anterior con qué comparar (sin ella, no hay ventas estimadas).
  con_anterior boolean not null default false,
  error text,
  pedida_por text,
  inicio timestamptz not null default now(),
  fin timestamptz
);
create index if not exists scraping_descubrir_lecturas_pais_idx on scraping_descubrir_lecturas (pais, inicio desc);

create table if not exists scraping_descubrir_proveedores (
  id uuid primary key default uuid_v7(),
  lectura_id uuid not null references scraping_descubrir_lecturas(id) on delete cascade,
  pais text not null,
  dropi_proveedor_id bigint not null,
  nombre text not null,
  productos integer not null,
  nuevos_30 integer not null,
  stock bigint not null,
  ventas_estimadas integer,
  con_ventas integer not null default 0,
  -- Sus productos más movidos (o más nuevos): [{ nombre, foto, ventas, creado }].
  destacados jsonb not null default '[]',
  unique (lectura_id, dropi_proveedor_id)
);
create index if not exists scraping_descubrir_proveedores_lectura_idx on scraping_descubrir_proveedores (lectura_id);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table scraping_descubrir_lecturas enable row level security;
alter table scraping_descubrir_proveedores enable row level security;
