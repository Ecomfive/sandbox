-- Anuncios Meta › el tipo de gancho de cada video (20 nov 2026, pedido de Alcides: saber qué hook funciona más).
-- `meta_video_analisis.gancho` es el texto libre de lo que pasa en los primeros segundos; `gancho_tipo` lo reparte en una lista fija
-- (pregunta, problema o dolor, resultado o transformación, dato o cifra…) para poder contar y comparar. Lo llena el análisis nuevo de la IA y
-- «Clasificar los ganchos» para los videos ya analizados (con el texto del gancho, sin volver a ver el video). Se puede correr más de una vez.

alter table meta_video_analisis add column if not exists gancho_tipo text;
