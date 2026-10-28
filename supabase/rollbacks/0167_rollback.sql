-- Reversa de 0167_compras_alertas_sin_stock.sql.
delete from notificaciones_usuario where tipo = 'sin_stock';
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check check (tipo in ('mencion', 'proveedor', 'tarea'));
drop table if exists compras_alertas_sin_stock;
