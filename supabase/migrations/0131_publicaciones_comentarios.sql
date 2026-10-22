-- Gestión de IDs Dropi › Actividad con comentarios (22 oct 2026), como la de Compras: comentarios con archivos, respuestas (un
-- nivel), reacciones y @menciones en cada publicación. Los cambios siguen saliendo de historial_auditoria.
-- Archivos en el bucket privado `publicaciones-dropi` (comentarios/<publicación>/…), con enlaces firmados de una hora.
-- RLS activado y sin políticas (solo el servidor). Reversa: supabase/rollbacks/0131_rollback.sql

create table if not exists dropi_publicacion_comentarios (
  id uuid primary key default uuid_v7(),
  publicacion_id uuid not null references dropi_publicaciones (id) on delete cascade,
  autor text,
  autor_id uuid references perfiles (id) on delete set null,
  texto text not null default '',
  respuesta_a uuid references dropi_publicacion_comentarios (id) on delete cascade,
  editado_en timestamptz,
  creado_en timestamptz not null default now()
);
alter table dropi_publicacion_comentarios enable row level security;
create index if not exists dropi_publicacion_comentarios_pub on dropi_publicacion_comentarios (publicacion_id, creado_en desc);

create table if not exists dropi_publicacion_adjuntos (
  id uuid primary key default uuid_v7(),
  publicacion_id uuid not null references dropi_publicaciones (id) on delete cascade,
  comentario_id uuid references dropi_publicacion_comentarios (id) on delete cascade,
  nombre text not null,
  extension text,
  tamano bigint,
  clase text not null default 'otro',
  ruta text not null unique,
  subido_por text,
  creado_en timestamptz not null default now()
);
alter table dropi_publicacion_adjuntos enable row level security;
create index if not exists dropi_publicacion_adjuntos_pub on dropi_publicacion_adjuntos (publicacion_id);
create index if not exists dropi_publicacion_adjuntos_com on dropi_publicacion_adjuntos (comentario_id);

create table if not exists dropi_publicacion_comentario_reacciones (
  comentario_id uuid not null references dropi_publicacion_comentarios (id) on delete cascade,
  usuario_id uuid not null references perfiles (id) on delete cascade,
  usuario_nombre text,
  emoji text not null,
  creado_en timestamptz not null default now(),
  primary key (comentario_id, usuario_id, emoji)
);
alter table dropi_publicacion_comentario_reacciones enable row level security;

insert into storage.buckets (id, name, public, file_size_limit) values ('publicaciones-dropi', 'publicaciones-dropi', false, 26214400)
on conflict (id) do nothing;
