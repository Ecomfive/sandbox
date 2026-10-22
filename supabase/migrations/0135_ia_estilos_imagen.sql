-- Gestión de IDs Dropi › Asistente de IA › Imágenes modelo (22 oct 2026).
--
-- El equipo sube imágenes que le gustan (Reglas › Imágenes modelo), la IA las analiza y aquí se guarda **solo el análisis como texto**: una guía
-- de estilo (composición, colores, luz, elementos gráficos). Las imágenes no se guardan. La guía se agrega al pedido de cada foto que genera
-- Gemini y al plan de fotos.
--  · `tipo`: «general» (vale para toda foto) o el tipo de foto del plan al que aplica (principal, beneficios, uso, comparacion,
--    estilo_cliente, contenido, detalle).
--  · `activo`: una guía apagada no se usa pero no se pierde.
--
-- RLS activado y sin políticas: solo el servidor, con la clave de servicio, toca los datos.
-- Reversa: supabase/rollbacks/0135_rollback.sql

create table if not exists dropi_ia_estilos_imagen (
  id uuid primary key default uuid_v7(),
  nombre text not null check (char_length(nombre) between 2 and 60),
  tipo text not null default 'general' check (tipo in ('general', 'principal', 'beneficios', 'uso', 'comparacion', 'estilo_cliente', 'contenido', 'detalle')),
  guia text not null check (char_length(guia) between 20 and 1500),
  activo boolean not null default true,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists dropi_ia_estilos_imagen_orden on dropi_ia_estilos_imagen (creado_en desc);

alter table dropi_ia_estilos_imagen enable row level security;
