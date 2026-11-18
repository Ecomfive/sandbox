-- Reversa de 0325 (Anuncios Meta: ángulo de cada video). Borra los análisis de los videos y los ángulos corregidos a mano; se vuelven a calcular al correr otra vez la migración y analizar.
drop table if exists meta_video_analisis;
notify pgrst, 'reload schema';
