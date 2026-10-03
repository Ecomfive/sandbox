-- Producto central: el SKU maestro es la identidad del producto (decisión del 24 sept 2026, WMS-REFERENCIA.md).
--
-- Cada variante de la ficha Shopify y cada producto de la ficha Dropi se enlazan a un SKU maestro con una llave foránea
-- real (antes solo guardaban un código de texto sin relación). El texto `sku` queda como copia del código del maestro,
-- que el servidor escribe al guardar. Por ahora el enlace es opcional (hay borradores); no se borra un SKU maestro que
-- tenga fichas enlazadas.
-- Las tablas ya llevan RLS sin políticas; no se crea ninguna nueva.

alter table wms_producto_variantes add column if not exists sku_maestro_id uuid references skus_maestros(id);
alter table wms_dropi_productos add column if not exists sku_maestro_id uuid references skus_maestros(id);

create index if not exists wms_producto_variantes_sku_maestro on wms_producto_variantes (sku_maestro_id) where sku_maestro_id is not null;
create index if not exists wms_dropi_productos_sku_maestro on wms_dropi_productos (sku_maestro_id) where sku_maestro_id is not null;
