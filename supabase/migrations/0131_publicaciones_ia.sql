-- Gestión de IDs Dropi › Asistente de IA (22 oct 2026).
--
-- Lo que la IA propone para una publicación, para no pagarlo dos veces y poder revisarlo después:
--  · tipo «texto»: títulos, descripción y ángulos de venta (OpenAI, con búsqueda en internet y la foto del producto).
--  · tipo «fotos»: el plan de fotos que faltan y, de cada una, dónde quedó la imagen generada con Gemini (en Storage,
--    wms-productos/publicaciones/<publicación>/ia/).
-- Subir lo propuesto a Dropi se hace a mano por ahora; esta tabla solo guarda lo generado.
--
-- Reversa: supabase/rollbacks/0131_rollback.sql

create table if not exists dropi_publicaciones_ia (
  id uuid primary key default uuid_v7(),
  publicacion_id uuid not null references dropi_publicaciones (id) on delete cascade,
  tipo text not null check (tipo in ('texto', 'fotos')),
  resultado jsonb not null default '{}'::jsonb,
  -- Con qué modelo de texto se hizo (las fotos usan el de imágenes de Gemini).
  modelo text,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists dropi_publicaciones_ia_publicacion on dropi_publicaciones_ia (publicacion_id, tipo, creado_en desc);

-- Solo el servidor (clave de servicio) toca los datos: RLS activado y sin políticas.
alter table dropi_publicaciones_ia enable row level security;
