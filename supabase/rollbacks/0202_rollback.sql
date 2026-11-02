-- Reversa de 0202_whatsapp_chat_interno_notas.sql: se quita la función. Los mensajes internos ya guardados son notas normales y se quedan.
drop function if exists whatsapp_enviar_interno(uuid, text, uuid, text);
