-- Operación › Gestión de IDs Effi (5 nov 2026, pedido de Hernán): los artículos de la cuenta ECOMFIVE de Effi (Costa Rica), leídos por la API oficial con la llave
-- de solo consulta. Una fila por artículo. Lo que deja de aparecer no se borra: queda con `en_effi = false`. El producto de Producto lo vincula una persona: la
-- lectura solo deja la sugerencia. Solo el servidor lee y escribe (RLS sin políticas). Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0230_rollback.sql

insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'publicaciones-effi', solo_lectura from permisos_rol where modulo = 'publicaciones-dropi'
on conflict (rol_id, modulo) do nothing;

create table if not exists effi_publicaciones (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  -- El ID del artículo en Effi («ID: 121»).
  effi_id text not null check (effi_id ~ '^[0-9]+$'),
  nombre text not null,
  referencia text,
  gtin text,
  categoria text,
  foto_url text,
  -- En la moneda de Effi del país (colones en Costa Rica).
  precio_dropshipping numeric(14, 2) check (precio_dropshipping is null or precio_dropshipping >= 0),
  precio_sugerido numeric(14, 2) check (precio_sugerido is null or precio_sugerido >= 0),
  precio_minimo numeric(14, 2) check (precio_minimo is null or precio_minimo >= 0),
  costo numeric(14, 2) check (costo is null or costo >= 0),
  -- Solo nuestras bodegas: las que tienen nombre de tienda son de cada dropshipper y no se tocan.
  stock_principal integer,
  stock_garantias integer,
  compartido boolean not null default false,
  en_effi boolean not null default true,
  sku_maestro_id uuid references skus_maestros(id) on delete set null,
  sugerido_sku_id uuid references skus_maestros(id) on delete set null,
  sugerencia text check (sugerencia is null or sugerencia in ('seguro', 'sugerido', 'varios', 'falta_compuesto', 'ninguno')),
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (pais_id, effi_id)
);

create index if not exists effi_publicaciones_pais_idx on effi_publicaciones (pais_id, en_effi);
create index if not exists effi_publicaciones_sku_idx on effi_publicaciones (sku_maestro_id) where sku_maestro_id is not null;

alter table effi_publicaciones enable row level security;
