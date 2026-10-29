-- Reversa de 0191_whatsapp_mensajes_editados.sql: se pierde el texto de antes de los mensajes editados y la marca «editado» (el texto nuevo se queda).
alter table whatsapp_mensajes drop column if exists texto_antes;
alter table whatsapp_mensajes drop column if exists editado_en;
