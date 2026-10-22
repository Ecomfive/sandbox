-- Reversa de 0129_competencia_fotos_video.sql.
alter table competencia_productos
  drop column if exists fotos,
  drop column if exists videos,
  drop column if exists descripcion_largo;
