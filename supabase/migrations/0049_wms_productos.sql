-- Sistema WMS: «Ficha producto Shopify». Réplica de la ficha de producto del admin de Shopify.
-- Un producto siempre tiene al menos una variante (como en Shopify: sin opciones es la variante única), y
-- el precio, SKU, peso e inventario viven en la variante.

create table if not exists wms_productos (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  titulo text not null,
  descripcion text not null default '',
  estado text not null default 'borrador' check (estado in ('activo', 'borrador', 'no_listado')),
  categoria text,
  tipo text,
  proveedor text,
  colecciones text[] not null default '{}',
  etiquetas text[] not null default '{}',
  plantilla_tema text not null default 'Producto predeterminado',
  canales text[] not null default '{}',
  cobrar_impuesto boolean not null default true,
  seguimiento_inventario boolean not null default true,
  vender_sin_existencias boolean not null default false,
  es_fisico boolean not null default true,
  embalaje text,
  pais_origen text,
  codigo_sa text,
  seo_titulo text,
  seo_descripcion text,
  seo_url text,
  metacampos jsonb not null default '[]',
  opciones jsonb not null default '[]',
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists wms_producto_variantes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references wms_productos(id) on delete cascade,
  posicion integer not null default 0,
  opciones jsonb not null default '{}',
  precio numeric(12, 2),
  precio_comparacion numeric(12, 2),
  costo numeric(12, 2),
  sku text,
  codigo_barras text,
  peso numeric(10, 3),
  unidad_peso text not null default 'kg' check (unidad_peso in ('kg', 'g', 'lb', 'oz'))
);

-- Cantidades por sucursal de cada variante. «En existencia» es la suma de las tres (como en Shopify).
create table if not exists wms_producto_inventario (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references wms_producto_variantes(id) on delete cascade,
  sucursal text not null,
  disponible integer not null default 0,
  comprometido integer not null default 0,
  no_disponible integer not null default 0,
  en_existencia integer generated always as (disponible + comprometido + no_disponible) stored,
  unique (variante_id, sucursal)
);

create table if not exists wms_producto_medios (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references wms_productos(id) on delete cascade,
  ruta text not null,
  nombre_archivo text,
  tipo text not null default 'imagen' check (tipo in ('imagen', 'video')),
  alt text not null default '',
  posicion integer not null default 0
);

create index if not exists wms_productos_pais_idx on wms_productos (pais_id, creado_en desc);
create index if not exists wms_variantes_producto_idx on wms_producto_variantes (producto_id, posicion);
create index if not exists wms_medios_producto_idx on wms_producto_medios (producto_id, posicion);

alter table wms_productos enable row level security;
alter table wms_producto_variantes enable row level security;
alter table wms_producto_inventario enable row level security;
alter table wms_producto_medios enable row level security;

create policy "authenticated read/write" on wms_productos for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on wms_producto_variantes for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on wms_producto_inventario for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on wms_producto_medios for all using (auth.role() = 'authenticated');

-- Imágenes y videos del producto: bucket público de lectura (se ven en la ficha); se escribe solo con el service role.
insert into storage.buckets (id, name, public)
values ('wms-productos', 'wms-productos', true)
on conflict (id) do nothing;

drop policy if exists "wms productos publico de lectura" on storage.objects;
create policy "wms productos publico de lectura" on storage.objects for select
  using (bucket_id = 'wms-productos');

insert into permisos_rol (rol_id, modulo)
select id, 'wms-productos' from roles where nombre = 'Admin'
on conflict do nothing;
