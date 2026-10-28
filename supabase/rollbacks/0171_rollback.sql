-- Reversa de 0171_whatsapp_no_se_borra.sql: vuelve a permitir borrar chats y quita las marcas.
drop trigger if exists whatsapp_conversaciones_no_vaciar on whatsapp_conversaciones;
drop trigger if exists whatsapp_mensajes_no_vaciar on whatsapp_mensajes;
drop trigger if exists whatsapp_conversaciones_no_borrar on whatsapp_conversaciones;
drop trigger if exists whatsapp_mensajes_no_borrar on whatsapp_mensajes;
drop function if exists whatsapp_no_borrar();
alter table whatsapp_mensajes drop column if exists eliminado_en_whatsapp_en;
alter table whatsapp_conversaciones drop column if exists borrada_en_app_por;
alter table whatsapp_conversaciones drop column if exists borrada_en_app_en;
