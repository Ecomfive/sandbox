-- Anuncios Meta (23 nov 2026, pedido de Alcides; documento «Métrica» de Oferfy): dos cifras más que el equipo mira para decidir qué hacer con un anuncio y que hasta ahora no se leían de Meta.
--   * Tiempo promedio de reproducción del video: Meta da el promedio por reproducción de cada día; se guardan las reproducciones y el tiempo total visto (promedio × reproducciones) para poder sumar días y
--     volver a sacar el promedio (`meta_resultados_dia.video_reproducciones` y `video_segundos`). Lo anterior queda en 0 = sin dato; se llena en la próxima lectura de Meta.
--   * Frecuencia: personas distintas alcanzadas en los últimos 7 días y veces que vieron en promedio el anuncio o la campaña. No se puede sumar día por día (el alcance cuenta personas distintas), así que se guarda
--     aparte, por anuncio y por campaña, la última lectura de esos 7 días (`meta_frecuencia`).
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0356_rollback.sql

alter table meta_resultados_dia
  add column if not exists video_reproducciones integer not null default 0,
  add column if not exists video_segundos numeric not null default 0;

create table if not exists meta_frecuencia (
  cuenta_id uuid not null references meta_cuentas (id) on delete cascade,
  tipo text not null check (tipo in ('anuncio', 'campana')),
  meta_id text not null,
  alcance integer not null default 0,
  frecuencia numeric not null default 0,
  desde date not null,
  hasta date not null,
  leida_en timestamptz not null default now(),
  primary key (cuenta_id, tipo, meta_id)
);

-- Solo el servidor, con la clave de servicio, toca estos datos (RLS sin políticas).
alter table meta_frecuencia enable row level security;

notify pgrst, 'reload schema';
