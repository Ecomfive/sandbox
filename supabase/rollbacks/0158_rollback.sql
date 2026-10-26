-- Reversa de 0158_whatsapp.sql. Borra todo el historial de WhatsApp guardado: hacer copia antes.
drop function if exists whatsapp_registrar_entrante(text, text, text, text, uuid, text, text, text, text, text, text, timestamptz, text);
drop table if exists whatsapp_mensajes;
drop table if exists whatsapp_conversaciones;
drop table if exists whatsapp_numeros;
