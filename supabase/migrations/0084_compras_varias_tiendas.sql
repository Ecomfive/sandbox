-- Compras: una compra puede salir de varias tiendas, y las tiendas se eligen o se crean al escribirlas, como las etiquetas
-- (pedido de Hernán, 9 oct 2026). Antes «Tienda» era un solo texto (`tienda`); ahora es una lista (`tiendas`).
--
-- Esta migración AGREGA la columna nueva y le pasa lo que ya había en `tienda` (una tienda por compra, sin tocar los
-- nombres). La columna vieja se queda por ahora, sin usarse: así el código anterior sigue funcionando hasta que el nuevo
-- se despliegue. Se borrará en una migración aparte cuando ya no quede nada que la lea.
--
-- Orden de aplicación: PRIMERO este SQL, DESPUÉS el despliegue del código (el código nuevo pide `tiendas`). Se puede correr
-- más de una vez sin duplicar nada.

alter table wms_compras add column if not exists tiendas text[] not null default '{}';

update wms_compras
   set tiendas = array[btrim(tienda)]
 where btrim(coalesce(tienda, '')) <> ''
   and tiendas = '{}';
