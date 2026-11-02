-- Transcribir los audios de WhatsApp (30 oct 2026, pedido de Jhokser).
--
-- Un audio se transcribe con la IA cuando alguien pulsa «Transcribir» en su burbuja; el texto se guarda aquí para que todos lo vean y no se vuelva a pagar.
-- Solo columnas nuevas, todas opcionales: sin ellas la bandeja carga igual (sin transcripciones). RLS ya está activado en la tabla y no cambia.

alter table whatsapp_mensajes add column if not exists transcripcion text;
alter table whatsapp_mensajes add column if not exists transcripcion_en timestamptz;
alter table whatsapp_mensajes add column if not exists transcripcion_modelo text;
alter table whatsapp_mensajes add column if not exists transcripcion_por text;
