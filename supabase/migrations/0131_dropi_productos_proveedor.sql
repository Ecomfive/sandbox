-- Gestión de IDs Dropi › Bodegas (pedido de Hernán, 22 oct 2026): nuestros productos tal como los ve ECOMFIVE en Dropi como
-- proveedor («Mis productos», activos y archivados), con la bodega donde está cada uno y su stock. Los llena la lectura
-- `leerNuestrosProductos` de scripts/scraping-proveedores-navegador.js (con la sesión del proveedor) a través del receptor
-- (scripts/scraping-proveedores.ts recibir), que además pone en cada publicación la ubicación, el precio, el tipo y el estado que
-- dice Dropi (scripts/publicaciones-sincronizar-dropi.ts). Una fila por producto de Dropi y país: se reemplaza en cada lectura.
-- Reversa: supabase/rollbacks/0131_rollback.sql

create table if not exists dropi_productos_proveedor (
  pais_id uuid not null references paises(id),
  dropi_producto_id integer not null,
  nombre text not null,
  -- SIMPLE o VARIABLE, como lo dice Dropi.
  tipo text,
  archivado boolean not null default false,
  privado boolean not null default false,
  precio numeric(12, 2),
  precio_sugerido numeric(12, 2),
  stock integer not null default 0,
  -- Lo que está reservado para los dropshippers a los que se privatizó.
  stock_privado integer not null default 0,
  -- Cada bodega con su stock: [{ "id": 81, "nombre": "Proveedor Ecomfive", "stock": 300 }] (las variaciones, sumadas por bodega).
  bodegas jsonb not null default '[]',
  categorias text[] not null default '{}',
  fotos integer,
  creado_dropi timestamptz,
  leido_en timestamptz not null default now(),
  primary key (pais_id, dropi_producto_id)
);

-- Cada lectura: cuándo, cuántos productos y qué cambió en las publicaciones.
create table if not exists dropi_productos_proveedor_lecturas (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  leido_en timestamptz not null default now(),
  productos integer not null,
  activos integer not null,
  archivados integer not null,
  publicaciones_actualizadas integer not null default 0,
  duracion_ms integer
);

create index if not exists dropi_productos_proveedor_lecturas_pais_idx on dropi_productos_proveedor_lecturas (pais_id, leido_en desc);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table dropi_productos_proveedor enable row level security;
alter table dropi_productos_proveedor_lecturas enable row level security;
