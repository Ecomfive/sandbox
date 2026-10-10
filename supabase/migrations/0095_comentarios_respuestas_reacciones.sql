-- Compras: comentarios como en ClickUp (pedido de Hernán, 8 oct 2026).
--   · respuesta_a: un comentario puede responder a otro (se ve debajo de él).
--   · autor_id: quién lo escribió (la persona, no solo su nombre), para avisarle cuando le responden.
--   · wms_compra_comentario_reacciones: «Me gusta» y emojis de cada persona en cada comentario.
-- RLS sin políticas: solo el servidor la toca (migración 0063, SEGURIDAD.md). Se puede correr antes o después de publicar:
-- sin ella la actividad sigue cargando, solo que sin respuestas ni reacciones.

alter table wms_compra_comentarios add column if not exists respuesta_a uuid references wms_compra_comentarios(id) on delete cascade;
alter table wms_compra_comentarios add column if not exists autor_id uuid references perfiles(id) on delete set null;
create index if not exists wms_compra_comentarios_respuesta_idx on wms_compra_comentarios (respuesta_a) where respuesta_a is not null;

create table if not exists wms_compra_comentario_reacciones (
  comentario_id uuid not null references wms_compra_comentarios(id) on delete cascade,
  usuario_id uuid not null references perfiles(id) on delete cascade,
  usuario_nombre text,
  emoji text not null check (char_length(emoji) between 1 and 16),
  creado_en timestamptz not null default now(),
  primary key (comentario_id, usuario_id, emoji)
);
alter table wms_compra_comentario_reacciones enable row level security;
