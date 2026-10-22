-- Gestión de IDs Dropi › Asistente de IA › Imágenes modelo (22 oct 2026): nuevos tipos de foto.
--
-- Tras investigar qué fotos necesita un comprador (FOTOS-PRODUCTO-INVESTIGACION.md) el asistente suma los tipos «ingredientes», «como_usar»
-- y «escala» a los que ya tenía. La guía de una imagen modelo (`dropi_ia_estilos_imagen.tipo`) puede aplicar a cualquiera, así que se quita
-- el `check` de 0135 que solo admitía los siete anteriores. La lista de tipos válidos vive en el código (`TIPOS_FOTO`) y se valida en el
-- servidor, que es donde se agrega un tipo nuevo sin tocar la base.
--
-- Reversa: supabase/rollbacks/0136_rollback.sql

alter table dropi_ia_estilos_imagen drop constraint if exists dropi_ia_estilos_imagen_tipo_check;
