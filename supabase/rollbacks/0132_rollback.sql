-- Reversa de 0132_publicaciones_comentarios.sql (borra los comentarios, archivos y reacciones de las publicaciones). Los archivos del
-- bucket `publicaciones-dropi` hay que vaciarlos desde Storage antes de borrar el bucket.
drop table if exists dropi_publicacion_comentario_reacciones;
drop table if exists dropi_publicacion_adjuntos;
drop table if exists dropi_publicacion_comentarios;
