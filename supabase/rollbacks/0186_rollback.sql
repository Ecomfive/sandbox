-- Reversa de 0186_whatsapp_reacciones.sql: las reacciones vuelven a verse como mensajes sueltos.
drop index if exists whatsapp_mensajes_reaccion_a_idx;
alter table whatsapp_mensajes drop column if exists reaccion_a;
