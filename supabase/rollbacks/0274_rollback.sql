-- Reversa de 0274_entregas_por_dropshipper.sql: quita la consulta y su índice (no hay datos que deshacer).
drop function if exists crm_entregas_por_producto(uuid, bigint[], date);
drop index if exists crm_ordenes_items_producto;
