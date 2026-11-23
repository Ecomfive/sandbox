-- Reversa de 0356: quita la frecuencia y el tiempo de reproducción de Anuncios Meta.
drop table if exists meta_frecuencia;
alter table meta_resultados_dia
  drop column if exists video_reproducciones,
  drop column if exists video_segundos;
notify pgrst, 'reload schema';
