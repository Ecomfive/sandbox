-- Productos Test: cada producto en prueba se puede elegir de los productos que ya existen en Producto (donde nacen los
-- productos), con el mismo buscador de la orden de compra (pedido de Hernán, 12 oct 2026). Queda vinculado a su producto; si el
-- producto se borra, el vínculo se quita y el producto en prueba se conserva con su nombre.

alter table wms_productos_test add column if not exists sku_maestro_id uuid references skus_maestros(id) on delete set null;
create index if not exists wms_productos_test_sku_idx on wms_productos_test (sku_maestro_id) where sku_maestro_id is not null;
