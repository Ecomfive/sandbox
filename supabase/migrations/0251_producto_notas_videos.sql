-- Notas de un producto con videos (7 nov 2026, pedido de Hernán: «el apartado de comentarios en Productos, para que podamos agregar las fotos y videos reales de cada
-- producto»): el bucket `producto-notas` (0250) pasa de 25 MB a 50 MB por archivo, el máximo de un video (`MAX_BYTES_VIDEO`). Las fotos y documentos siguen en 25 MB:
-- lo revisa el servidor. Si el proyecto de Supabase tiene un límite global menor (Storage › Settings), manda ese. Se puede correr más de una vez.
-- Reversa: supabase/rollbacks/0251_rollback.sql

update storage.buckets set file_size_limit = 52428800 where id = 'producto-notas';
