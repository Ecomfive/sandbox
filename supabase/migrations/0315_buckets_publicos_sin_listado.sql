-- Buckets públicos sin listado (auditoría de seguridad, 18 nov 2026).
--
-- `avatars` y `wms-productos` son buckets públicos: cada archivo se ve por su dirección pública (/storage/v1/object/public/...)
-- sin ninguna política. Las políticas de lectura sobre storage.objects que se crearon en 0011 y 0049 no hacen falta para eso,
-- y además dejaban LISTAR el bucket entero con la clave pública (fotos de novedades, selección y sugerencias que viven en carpetas
-- con nombres al azar justamente para no poder adivinarse). La app lee y escribe estos buckets solo desde el servidor con la clave
-- de servicio, que no pasa por estas políticas. Se quitan; las fotos se siguen viendo igual.
--
-- Repetible. Reversa: supabase/rollbacks/0315_rollback.sql.

drop policy if exists "avatar publico de lectura" on storage.objects;
drop policy if exists "wms productos publico de lectura" on storage.objects;
