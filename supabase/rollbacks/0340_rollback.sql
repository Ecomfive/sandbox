-- Reversa de 0340_dropi_resumen_mensual.sql: quita el resumen de Dropi, el módulo de su pestaña y la bodega y guía de los pedidos.
drop function if exists dropi_resumen_mensual(uuid, date, date);
delete from permisos_rol where modulo = 'pedidos-dropi-resumen';
delete from permisos_persona where modulo = 'pedidos-dropi-resumen';
drop index if exists ordenes_bodega_idx;
alter table ordenes drop column if exists guia;
alter table ordenes drop column if exists bodega_id;
notify pgrst, 'reload schema';
