-- Reversa de 0201_crm_productos_por_dropshipper.sql. La columna `crm_ordenes_items.producto_id` es de la 0198: se queda.
drop function if exists crm_productos_por_dropshipper(uuid, integer);
drop index if exists crm_ordenes_items_producto;
