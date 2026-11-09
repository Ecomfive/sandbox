-- Gestión de IDs Dropi › Reglas › Actividad (8 nov 2026, pedido de Alcides: «que quede grabado cuando alguien cambie alguna regla»), como la de Compras:
-- comentarios con archivos, respuestas (un nivel), reacciones y @menciones. Los cambios (reglas, indicaciones para la IA, imágenes modelo) salen de
-- historial_auditoria. Las reglas son una sola para todo el sistema: `reglas_id` es siempre el mismo id fijo (`REGLAS_ID` en el código).
-- Archivos en el bucket privado `publicaciones-dropi` (comentarios/<reglas_id>/…). RLS activado y sin políticas. Reversa: supabase/rollbacks/0253_rollback.sql

create table if not exists dropi_reglas_comentarios (
  id uuid primary key default uuid_v7(),
  reglas_id uuid not null,
  autor text,
  autor_id uuid references perfiles (id) on delete set null,
  texto text not null default '',
  respuesta_a uuid references dropi_reglas_comentarios (id) on delete cascade,
  editado_en timestamptz,
  creado_en timestamptz not null default now()
);
alter table dropi_reglas_comentarios enable row level security;
create index if not exists dropi_reglas_comentarios_reglas on dropi_reglas_comentarios (reglas_id, creado_en desc);

create table if not exists dropi_reglas_adjuntos (
  id uuid primary key default uuid_v7(),
  reglas_id uuid not null,
  comentario_id uuid references dropi_reglas_comentarios (id) on delete cascade,
  nombre text not null,
  extension text,
  tamano bigint,
  clase text not null default 'otro',
  ruta text not null unique,
  subido_por text,
  creado_en timestamptz not null default now()
);
alter table dropi_reglas_adjuntos enable row level security;
create index if not exists dropi_reglas_adjuntos_reglas on dropi_reglas_adjuntos (reglas_id);
create index if not exists dropi_reglas_adjuntos_com on dropi_reglas_adjuntos (comentario_id);

create table if not exists dropi_reglas_comentario_reacciones (
  comentario_id uuid not null references dropi_reglas_comentarios (id) on delete cascade,
  usuario_id uuid not null references perfiles (id) on delete cascade,
  usuario_nombre text,
  emoji text not null,
  creado_en timestamptz not null default now(),
  primary key (comentario_id, usuario_id, emoji)
);
alter table dropi_reglas_comentario_reacciones enable row level security;
