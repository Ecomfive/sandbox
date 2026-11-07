-- Notas de un producto (7 nov 2026, pedido de Hernán: «cuando estoy ingresando inventario necesitaría poder entrar a la ficha del
-- producto… ver lo último que ha pasado… y también poder agregar notas»): comentarios con archivos, respuestas (un nivel), reacciones
-- y @menciones en cada producto (`skus_maestros`), con el motor común de `src/lib/comentarios/servidor.ts`, como en el CRM (0184).
-- Se ven en la ficha del inventario (Inventario y Levantamiento). Son del producto: las mismas en todos los países.
-- Archivos en el bucket privado `producto-notas` (comentarios/<producto>/…), con enlaces firmados de una hora.
-- RLS activado y sin políticas (solo el servidor). Reversa: supabase/rollbacks/0250_rollback.sql

create table if not exists sku_comentarios (
  id uuid primary key default uuid_v7(),
  sku_maestro_id uuid not null references skus_maestros (id) on delete cascade,
  autor text,
  autor_id uuid references perfiles (id) on delete set null,
  texto text not null default '',
  respuesta_a uuid references sku_comentarios (id) on delete cascade,
  editado_en timestamptz,
  creado_en timestamptz not null default now()
);
alter table sku_comentarios enable row level security;
create index if not exists sku_comentarios_sku on sku_comentarios (sku_maestro_id, creado_en desc);

create table if not exists sku_adjuntos (
  id uuid primary key default uuid_v7(),
  sku_maestro_id uuid not null references skus_maestros (id) on delete cascade,
  comentario_id uuid references sku_comentarios (id) on delete cascade,
  nombre text not null,
  extension text,
  tamano bigint,
  clase text not null default 'otro',
  ruta text not null unique,
  subido_por text,
  creado_en timestamptz not null default now()
);
alter table sku_adjuntos enable row level security;
create index if not exists sku_adjuntos_sku on sku_adjuntos (sku_maestro_id);
create index if not exists sku_adjuntos_com on sku_adjuntos (comentario_id);

create table if not exists sku_comentario_reacciones (
  comentario_id uuid not null references sku_comentarios (id) on delete cascade,
  usuario_id uuid not null references perfiles (id) on delete cascade,
  usuario_nombre text,
  emoji text not null,
  creado_en timestamptz not null default now(),
  primary key (comentario_id, usuario_id, emoji)
);
alter table sku_comentario_reacciones enable row level security;

insert into storage.buckets (id, name, public, file_size_limit) values ('producto-notas', 'producto-notas', false, 26214400)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
