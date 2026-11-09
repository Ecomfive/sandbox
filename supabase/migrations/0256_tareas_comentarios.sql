-- Gestión de IDs Dropi › Tareas › Actividad (8 nov 2026, pedido de Alcides), como la de Compras: comentarios con archivos, respuestas (un nivel),
-- reacciones y @menciones en cada tarea escrita a mano. Los cambios salen de historial_auditoria. Archivos en el bucket privado `publicaciones-dropi`
-- (comentarios/<tarea>/…). RLS activado y sin políticas. Reversa: supabase/rollbacks/0256_rollback.sql

create table if not exists dropi_tarea_comentarios (
  id uuid primary key default uuid_v7(),
  tarea_id uuid not null references dropi_publicaciones_tareas (id) on delete cascade,
  autor text,
  autor_id uuid references perfiles (id) on delete set null,
  texto text not null default '',
  respuesta_a uuid references dropi_tarea_comentarios (id) on delete cascade,
  editado_en timestamptz,
  creado_en timestamptz not null default now()
);
alter table dropi_tarea_comentarios enable row level security;
create index if not exists dropi_tarea_comentarios_tarea on dropi_tarea_comentarios (tarea_id, creado_en desc);

create table if not exists dropi_tarea_adjuntos (
  id uuid primary key default uuid_v7(),
  tarea_id uuid not null references dropi_publicaciones_tareas (id) on delete cascade,
  comentario_id uuid references dropi_tarea_comentarios (id) on delete cascade,
  nombre text not null,
  extension text,
  tamano bigint,
  clase text not null default 'otro',
  ruta text not null unique,
  subido_por text,
  creado_en timestamptz not null default now()
);
alter table dropi_tarea_adjuntos enable row level security;
create index if not exists dropi_tarea_adjuntos_tarea on dropi_tarea_adjuntos (tarea_id);
create index if not exists dropi_tarea_adjuntos_com on dropi_tarea_adjuntos (comentario_id);

create table if not exists dropi_tarea_comentario_reacciones (
  comentario_id uuid not null references dropi_tarea_comentarios (id) on delete cascade,
  usuario_id uuid not null references perfiles (id) on delete cascade,
  usuario_nombre text,
  emoji text not null,
  creado_en timestamptz not null default now(),
  primary key (comentario_id, usuario_id, emoji)
);
alter table dropi_tarea_comentario_reacciones enable row level security;
