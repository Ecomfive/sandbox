-- Filtro de productos: todo producto de Test productos vinculado a un producto Activo de Producto pasa solo a Filtro de
-- productos (pedido de Hernán, 12 oct 2026). Cada fila de Filtro guarda de qué test vino (uno solo por test) y su producto.

alter table wms_filtro_productos
  add column if not exists producto_test_id uuid references wms_productos_test(id) on delete set null,
  add column if not exists sku_maestro_id uuid references skus_maestros(id) on delete set null;
create unique index if not exists wms_filtro_productos_test_uidx on wms_filtro_productos (producto_test_id) where producto_test_id is not null;
