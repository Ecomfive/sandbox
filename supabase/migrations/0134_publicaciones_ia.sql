-- Gestión de IDs Dropi › Asistente de IA (22 oct 2026).
--
-- Lo que la IA propone para una publicación, para no pagarlo dos veces, poder revisarlo después y aprender de lo que el equipo elige:
--  · tipo «analisis»: qué mejorar y en qué orden, y sugerencias de proceso para el equipo.
--  · tipo «titulos»: los títulos propuestos (ya revisados con las reglas) y el que eligió el equipo (quizá corregido).
--  · tipo «texto»: descripción y ángulos de venta (investigados en internet, con la foto del producto).
--  · tipo «fotos»: el plan de fotos que faltan y, de cada una, dónde quedó la imagen generada con Gemini (en Storage,
--    wms-productos/publicaciones/<publicación>/ia/).
-- Cada resultado puede llevar la valoración del equipo («me sirvió» / «no me sirvió») dentro de `resultado`.
-- Subir lo propuesto a Dropi se hace a mano por ahora.
--
-- Además, `dropi_ia_indicaciones`: lo que el equipo le dice a la IA (Reglas › Indicaciones para la IA), por parte: para todo, títulos,
-- descripción y ángulos, fotos, análisis. Se agrega a cada pedido.
--
-- Reversa: supabase/rollbacks/0134_rollback.sql

create table if not exists dropi_publicaciones_ia (
  id uuid primary key default uuid_v7(),
  publicacion_id uuid not null references dropi_publicaciones (id) on delete cascade,
  tipo text not null check (tipo in ('analisis', 'titulos', 'texto', 'fotos')),
  resultado jsonb not null default '{}'::jsonb,
  -- Con qué modelo de texto se hizo (las fotos usan el de imágenes de Gemini).
  modelo text,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists dropi_publicaciones_ia_publicacion on dropi_publicaciones_ia (publicacion_id, tipo, creado_en desc);
create index if not exists dropi_publicaciones_ia_tipo on dropi_publicaciones_ia (tipo, creado_en desc);

create table if not exists dropi_ia_indicaciones (
  clave text primary key check (clave in ('general', 'titulo', 'descripcion', 'fotos', 'analisis')),
  texto text not null default '',
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  actualizado_por_nombre text
);

-- Solo el servidor (clave de servicio) toca los datos: RLS activado y sin políticas.
alter table dropi_publicaciones_ia enable row level security;
alter table dropi_ia_indicaciones enable row level security;
