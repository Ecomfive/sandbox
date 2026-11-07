-- Reversa de 0250_producto_notas.sql: borra las notas de los productos (con sus archivos y reacciones). Los archivos del bucket
-- `producto-notas` hay que vaciarlos antes desde Storage; el bucket se borra solo si quedó vacío.
drop table if exists sku_comentario_reacciones;
drop table if exists sku_adjuntos;
drop table if exists sku_comentarios;
delete from storage.buckets where id = 'producto-notas' and not exists (select 1 from storage.objects where bucket_id = 'producto-notas');
notify pgrst, 'reload schema';
