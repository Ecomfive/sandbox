-- Reversa de 0281_guias_por_producto_dropi.sql: quita la consulta de guías por producto de Dropi (no hay datos que borrar).
drop function if exists dropi_guias_por_producto(uuid, integer);
