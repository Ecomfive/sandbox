-- Anuncios Meta (24 nov 2026, pedido de Alcides): el ángulo de un video puede ser una táctica general («Antes y después», «Testimonio de cliente», «Experto o autoridad») que sirve para comparar entre
-- productos, y además lleva su detalle: de qué es el antes y después, de qué habla el testimonio, quién es el experto y de qué. `meta_video_analisis.angulo_detalle`: la IA lo llena al analizar o al reanalizar
-- el ángulo. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0357_rollback.sql

alter table meta_video_analisis
  add column if not exists angulo_detalle text;

notify pgrst, 'reload schema';
