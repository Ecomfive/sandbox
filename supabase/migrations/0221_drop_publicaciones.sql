-- Operación › Fulfillment › Gestión de IDs Drop con datos (pedido de Hernán, 3 nov 2026): los productos de ECOMFIVE en Drop (app.soydrop.com, la cuenta
-- «Proveedor Ecomfive Costa Rica», precios en colones). Se leen desde la pestaña de Drop con la sesión del proveedor (scripts/scraping-proveedores-navegador.js
-- › leerDrop) y los guarda scripts/drop-guardar.ts: una fila por producto de Drop (su id interno). Lo que deja de aparecer en Drop no se borra: queda con
-- `en_drop = false`. El producto de Producto se vincula a mano desde la lista (como en Gestión de IDs Dropi, decisión de Alcides del 25 oct 2026): la
-- lectura solo deja la sugerencia (`sugerido_sku_id`, por el nombre y la foto, `sugerirSku`). Solo el servidor lee y escribe (RLS sin políticas).
-- Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0221_rollback.sql

create table if not exists drop_publicaciones (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  -- El id interno de Drop (el de /vendor/products/details/<id>/inventory) y el ID corto que muestra («ID-ONWAG»).
  drop_id text not null check (drop_id ~ '^[0-9a-f]{24}$'),
  codigo text check (codigo is null or codigo ~ '^ID-[A-Z0-9]{3,12}$'),
  nombre text not null,
  -- El SKU de Drop, tal cual: no se cambia ni en Drop ni aquí.
  sku_drop text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  -- En la moneda de Drop del país (colones en Costa Rica).
  precio numeric(12, 2) check (precio is null or precio >= 0),
  inventario integer check (inventario is null or inventario >= 0),
  foto_url text,
  foto_huella text,
  creado_en_drop timestamptz,
  en_drop boolean not null default true,
  sku_maestro_id uuid references skus_maestros(id) on delete set null,
  sugerido_sku_id uuid references skus_maestros(id) on delete set null,
  sugerencia text check (sugerencia is null or sugerencia in ('seguro', 'sugerido', 'varios', 'falta_compuesto', 'ninguno')),
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (pais_id, drop_id)
);

create index if not exists drop_publicaciones_pais_idx on drop_publicaciones (pais_id, en_drop);
create index if not exists drop_publicaciones_sku_idx on drop_publicaciones (sku_maestro_id) where sku_maestro_id is not null;

alter table drop_publicaciones enable row level security;
