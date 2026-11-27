-- Reversa de 0357: quita el detalle del ángulo de los videos de Anuncios Meta.
alter table meta_video_analisis drop column if exists angulo_detalle;
notify pgrst, 'reload schema';
