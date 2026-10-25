-- Gestión de IDs Dropi › Fotos de cada publicación en el sistema (pedido de Alcides, 25 oct 2026). La lectura diaria de «Mis productos»
-- de Dropi ya trae la galería de cada producto; el servidor copia cada foto al bucket `wms-productos` (publicaciones/<id>/dropi/<nombre>)
-- y la anota aquí. La ficha de la publicación las muestra y «Republicar» las sube desde aquí, sin depender del CDN de Dropi (que guarda
-- copias sin la cabecera CORS y desde la pestaña de Dropi el navegador no las deja leer).
-- Reversa: supabase/rollbacks/0153_rollback.sql

create table if not exists dropi_publicacion_fotos (
  id uuid primary key default uuid_v7(),
  publicacion_id uuid not null references dropi_publicaciones(id) on delete cascade,
  -- El producto de Dropi del que salió (una publicación puede tener dos IDs).
  dropi_producto_id integer,
  -- El nombre del archivo en Dropi: identifica la foto (Dropi le antepone un número al subirla, así que se compara por el final).
  nombre text not null,
  -- De dónde se bajó (el CDN de Dropi) y dónde quedó en el bucket.
  origen_url text not null,
  ruta text not null,
  url text not null,
  tipo text not null,
  bytes integer,
  principal boolean not null default false,
  orden integer not null default 0,
  -- false si Dropi ya no la lista (se conserva la copia).
  en_dropi boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (publicacion_id, nombre)
);

create index if not exists dropi_publicacion_fotos_publicacion on dropi_publicacion_fotos (publicacion_id, orden);

-- Como todas las tablas: RLS activado y sin políticas (solo el servidor, con la clave de servicio).
alter table dropi_publicacion_fotos enable row level security;
