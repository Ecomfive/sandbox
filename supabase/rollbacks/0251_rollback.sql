-- Reversa de 0251_producto_notas_videos.sql: el bucket vuelve a 25 MB por archivo. Los videos ya subidos se quedan.

update storage.buckets set file_size_limit = 26214400 where id = 'producto-notas';
