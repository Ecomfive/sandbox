-- Reversa de 0326 (Anuncios Meta: estructura y llamado a la acción de los videos, y retención por cuartiles). Borra esas columnas; el resto de los análisis queda.
alter table meta_video_analisis drop column if exists version, drop column if exists cta, drop column if exists cta_segundo, drop column if exists cta_tipo, drop column if exists oferta, drop column if exists recursos, drop column if exists estructura;
alter table meta_resultados_dia drop column if exists video_25, drop column if exists video_50, drop column if exists video_75, drop column if exists video_95;
notify pgrst, 'reload schema';
