-- Reversa de 0170_whatsapp_plantillas.sql. Borra las plantillas y las alertas guardadas (no las de Meta): hacer copia antes.
alter table whatsapp_mensajes drop column if exists plantilla_id;
alter table whatsapp_numeros drop column if exists limite_actualizado_en;
alter table whatsapp_numeros drop column if exists limite_mensajes;
drop table if exists whatsapp_alertas;
drop table if exists whatsapp_plantillas;
delete from notificaciones_usuario where tipo = 'whatsapp';
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock'));
