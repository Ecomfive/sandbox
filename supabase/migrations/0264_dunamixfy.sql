-- Dunamixfy en el sistema (9 nov 2026, pedido de Hernán: «lo que hicimos con Dropi, con Effi y con Drop… con Dunamixfy: productos, ventas, inventario»). Dunamixfy
-- (dunamixfy.cr) es la plataforma de Costa Rica donde ECOMFIVE es proveedor («Dunamix EF», bodega «Almacen Cielos Abiertos»). La extensión «Ecomfive · Dropi»
-- lee su API interna DESDE SU PESTAÑA, con la sesión del proveedor (lector `dunamixfy_cr`), y el sistema guarda (src/lib/dunamixfy/guardar.ts):
-- * dunamixfy_publicaciones: una fila por producto de Dunamixfy (su número, «#837»): precio al dropshipper, sugerido, stock de nuestra bodega allá. Lo que deja de
--   aparecer no se borra: queda con `en_dunamixfy = false`. El producto de Producto lo vincula una persona (Gestión de IDs Dunamixfy); la lectura solo sugiere.
-- * plataforma_ventas_diarias con plataforma «dunamixfy»: lo que salió de la bodega por producto y día, y lo devuelto (Ventas Proveeduría, Inventario › Cuadro).
-- * dunamixfy_vendedores: los dropshippers que venden nuestros productos allá (su id y nombre en Dunamixfy, con sus pedidos), para el CRM.
-- Además: «Dynamic 5» de Configuración › Plataformas de Costa Rica (cargada en 0014 con el nombre mal escrito, como «Drog» y «EFI») pasa a llamarse «Dunamixfy», y el
-- módulo «publicaciones-dunamixfy» toma los permisos de Gestión de IDs Dropi. Solo el servidor lee y escribe (RLS sin políticas). Se puede correr de nuevo.
-- Reversa: supabase/rollbacks/0264_rollback.sql

update plataformas set nombre = 'Dunamixfy'
where nombre = 'Dynamic 5' and not exists (select 1 from plataformas where nombre = 'Dunamixfy');

insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'publicaciones-dunamixfy', solo_lectura from permisos_rol where modulo = 'publicaciones-dropi'
on conflict (rol_id, modulo) do nothing;

create table if not exists dunamixfy_publicaciones (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  -- El número del producto en Dunamixfy («#837», `productNumberId`) y su id interno.
  dunamixfy_id text not null check (dunamixfy_id ~ '^[0-9]{1,9}$'),
  interno text,
  nombre text not null,
  -- El SKU de Dunamixfy, tal cual (EFV01…): no se cambia ni allá ni aquí.
  sku_dunamixfy text,
  categoria text,
  -- En colones: lo que paga el dropshipper y el precio de venta sugerido.
  precio numeric(14, 2) check (precio is null or precio >= 0),
  precio_sugerido numeric(14, 2) check (precio_sugerido is null or precio_sugerido >= 0),
  -- Las unidades de nuestra bodega allá (solo los inventarios activos) y las apartadas por pedidos.
  stock integer check (stock is null or stock >= 0),
  reservado integer check (reservado is null or reservado >= 0),
  -- Activo y público en el Marketplace de Dunamixfy.
  activo boolean not null default true,
  privado boolean not null default false,
  foto_url text,
  foto_huella text,
  creado_en_dunamixfy timestamptz,
  en_dunamixfy boolean not null default true,
  sku_maestro_id uuid references skus_maestros(id) on delete set null,
  sugerido_sku_id uuid references skus_maestros(id) on delete set null,
  sugerencia text check (sugerencia is null or sugerencia in ('seguro', 'sugerido', 'varios', 'falta_compuesto', 'ninguno')),
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (pais_id, dunamixfy_id)
);
create index if not exists dunamixfy_publicaciones_pais_idx on dunamixfy_publicaciones (pais_id, en_dunamixfy);
create index if not exists dunamixfy_publicaciones_sku_idx on dunamixfy_publicaciones (sku_maestro_id) where sku_maestro_id is not null;
alter table dunamixfy_publicaciones enable row level security;

create table if not exists dunamixfy_vendedores (
  pais_id uuid not null references paises(id),
  -- El id del usuario dropshipper en Dunamixfy y su nombre allá (persona o tienda).
  vendedor_id text not null check (vendedor_id ~ '^[a-z0-9]{10,40}$'),
  nombre text not null,
  tienda text,
  pedidos integer not null default 0,
  entregados integer not null default 0,
  devueltos integer not null default 0,
  primer_pedido timestamptz,
  ultimo_pedido timestamptz,
  actualizado_en timestamptz not null default now(),
  primary key (pais_id, vendedor_id)
);
alter table dunamixfy_vendedores enable row level security;

-- Las ventas diarias aceptan también Dunamixfy (el id es el número del producto, `dunamixfy_publicaciones.dunamixfy_id`).
alter table plataforma_ventas_diarias drop constraint if exists plataforma_ventas_diarias_plataforma_check;
alter table plataforma_ventas_diarias add constraint plataforma_ventas_diarias_plataforma_check check (plataforma in ('effi', 'drop', 'dunamixfy'));

notify pgrst, 'reload schema';
