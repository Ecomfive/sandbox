-- Reversa de 0285_tienda_chats.sql: se quita lo que el sistema anotaba de los chats (los chats siguen en iComfly).
drop table if exists tienda_chat_conversaciones;
drop table if exists tienda_chat_mensajes;
notify pgrst, 'reload schema';
