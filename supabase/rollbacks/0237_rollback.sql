-- Reversa de 0237_remisiones_correcciones.sql. Las líneas anuladas vuelven a contar como recibidas con 0: sus unidades ya regresaron a la bodega y esa devolución no se deshace.

drop function if exists wms_resolver_correccion_remision(uuid, boolean, text, uuid, text);
update wms_envios_dropi set estado = 'recibido', recibida = 0, motivo_diferencia = 'Remisión anulada' where estado = 'anulado';
alter table wms_envios_dropi drop constraint if exists wms_envios_dropi_estado_check;
alter table wms_envios_dropi add constraint wms_envios_dropi_estado_check check (estado in ('en_camino', 'recibido'));
delete from notificaciones_usuario where tipo = 'remision';
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock', 'whatsapp'));
drop table if exists wms_correcciones_remision;
drop table if exists wms_autorizadores_remision;
