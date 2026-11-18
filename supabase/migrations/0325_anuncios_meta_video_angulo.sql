-- Anuncios Meta (18 nov 2026, pedido de Alcides): el ángulo de una campaña no va en su nombre, así que sale de lo que dice y muestra cada video. Gemini ve el video completo y devuelve el ángulo (el motivo de compra que
-- usa), la promesa, el gancho de los primeros segundos, lo que se dice y a quién le habla. Una fila por video de Meta (`video_id`):
--   * `estado`: analizado (con el video), sin_archivo (Meta no dejó bajarlo: se analizó solo el texto y la miniatura, ángulo provisional) o error.
--   * `angulo_manual`: una persona corrigió el ángulo; un nuevo análisis ya no lo pisa.
-- RLS activado y sin políticas: solo el servidor con la clave de servicio toca esta tabla. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0325_rollback.sql

create table if not exists meta_video_analisis (
  video_id text primary key check (video_id ~ '^[0-9]{5,25}$'),
  cuenta_id uuid references meta_cuentas (id) on delete cascade,
  estado text not null check (estado in ('analizado', 'sin_archivo', 'error')),
  origen text not null default 'video' check (origen in ('video', 'texto')),
  angulo text,
  angulo_manual boolean not null default false,
  promesa text,
  gancho text,
  resumen text,
  transcripcion text,
  publico text,
  formato text,
  duracion_s integer,
  modelo text,
  error text,
  analizado_por text,
  analizado_en timestamptz not null default now()
);
alter table meta_video_analisis enable row level security;
create index if not exists meta_video_analisis_estado_idx on meta_video_analisis (estado, analizado_en);

notify pgrst, 'reload schema';
