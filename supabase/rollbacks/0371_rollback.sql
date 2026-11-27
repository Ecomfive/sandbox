-- Reversa de 0371_pedidos_items_en_proceso.sql: se pierde qué productos estaban marcados «En proceso».
alter table despacho_pedidos_inventario_items drop column if exists en_proceso_por_nombre;
alter table despacho_pedidos_inventario_items drop column if exists en_proceso_por;
alter table despacho_pedidos_inventario_items drop column if exists en_proceso_en;
notify pgrst, 'reload schema';
