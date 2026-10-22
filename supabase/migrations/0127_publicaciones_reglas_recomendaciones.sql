-- Gestión de IDs Dropi › Reglas y recomendaciones (fase 1, 21 oct 2026).
--
-- 1. `dropi_publicaciones_reglas`: los umbrales con que el sistema calcula las acciones y las recomendaciones (margen mínimo,
--    crítico, saludable, caída de ventas, combo…). Una fila por regla; la que falte usa su valor de siempre (en el código,
--    src/lib/publicaciones/reglas.ts). Los porcentajes se guardan como fracción (0.30 = 30 %).
-- 2. `dropi_publicaciones_decisiones`: cada vez que alguien acepta, rechaza o pospone una recomendación, con su porqué y los
--    números con que se calculó. Es la trazabilidad y lo que la IA leerá en la fase 2 para aprender. No se edita ni se borra
--    a mano (se va con la publicación si esta se elimina).
--
-- Como toda tabla: RLS activado y sin políticas (solo el servidor, con la clave de servicio).
-- Reversa: supabase/rollbacks/0127_rollback.sql

create table if not exists dropi_publicaciones_reglas (
  clave text primary key,
  valor numeric(12, 4) not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  actualizado_por_nombre text
);
alter table dropi_publicaciones_reglas enable row level security;

create table if not exists dropi_publicaciones_decisiones (
  id uuid primary key default uuid_v7(),
  publicacion_id uuid not null references dropi_publicaciones (id) on delete cascade,
  tipo text not null,
  decision text not null check (decision in ('aceptada', 'rechazada', 'pospuesta')),
  nota text,
  -- Lo que decía la recomendación al decidirla: título, motivo, resultado y sus números.
  recomendacion jsonb not null default '{}'::jsonb,
  -- Hasta qué día no vuelve a salir esa recomendación en esa publicación.
  vigente_hasta date not null,
  usuario_id uuid,
  usuario_nombre text,
  creado_en timestamptz not null default now()
);
alter table dropi_publicaciones_decisiones enable row level security;
create index if not exists dropi_publicaciones_decisiones_pub on dropi_publicaciones_decisiones (publicacion_id, tipo, creado_en desc);
create index if not exists dropi_publicaciones_decisiones_fecha on dropi_publicaciones_decisiones (creado_en desc);
