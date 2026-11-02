-- Reversa de 0200_whatsapp_transcripcion_audios.sql: se pierden las transcripciones guardadas (los audios no se tocan).
alter table whatsapp_mensajes drop column if exists transcripcion_por;
alter table whatsapp_mensajes drop column if exists transcripcion_modelo;
alter table whatsapp_mensajes drop column if exists transcripcion_en;
alter table whatsapp_mensajes drop column if exists transcripcion;
