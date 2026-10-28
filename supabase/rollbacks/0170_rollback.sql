-- Reversa de 0170_whatsapp_archivos.sql. Los archivos del bucket `whatsapp` no se borran aquí: vaciarlo a mano desde Storage si
-- hace falta (Supabase no deja borrar un bucket con archivos).
alter table whatsapp_mensajes drop column if exists media_ruta;
