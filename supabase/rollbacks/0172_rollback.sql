-- Reversa de 0172_whatsapp_borrado_con_autorizacion.sql. Lo que estaba oculto vuelve a verse al quitar las columnas; se pierde el historial de solicitudes.
drop table if exists whatsapp_solicitudes_borrado;
alter table whatsapp_mensajes drop column if exists oculto_por;
alter table whatsapp_mensajes drop column if exists oculto_en;
alter table whatsapp_conversaciones drop column if exists oculta_por;
alter table whatsapp_conversaciones drop column if exists oculta_en;
