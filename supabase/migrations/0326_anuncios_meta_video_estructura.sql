-- Anuncios Meta (18 nov 2026, pedido de Alcides): con el video completo la IA también saca cómo está armado (estructura por partes con sus segundos), el llamado a la acción (qué dice, en qué segundo aparece y de qué tipo es),
-- la oferta y los recursos que usa. Y para medir cuánta gente llega a ese llamado, cada anuncio y día guarda cuántos vieron el 25, 50, 75 y 95 % del video (la retención que da Meta).
--   * `meta_video_analisis.version`: 1 = análisis anterior (sin estructura); 2 = con estructura y llamado a la acción. «Analizar los pendientes» vuelve a ver los de versión 1.
--   * `meta_resultados_dia.video_25/50/75/95`: reproducciones que llegaron a ese punto; se llenan en la próxima lectura de Meta (lo anterior queda en 0 = sin dato).
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0326_rollback.sql

alter table meta_video_analisis
  add column if not exists version integer not null default 1,
  add column if not exists cta text,
  add column if not exists cta_segundo integer check (cta_segundo is null or cta_segundo between 0 and 3600),
  add column if not exists cta_tipo text,
  add column if not exists oferta text,
  add column if not exists recursos text[] not null default '{}',
  add column if not exists estructura jsonb not null default '[]'::jsonb;

alter table meta_resultados_dia
  add column if not exists video_25 integer not null default 0,
  add column if not exists video_50 integer not null default 0,
  add column if not exists video_75 integer not null default 0,
  add column if not exists video_95 integer not null default 0;

notify pgrst, 'reload schema';
