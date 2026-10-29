-- Reversa de 0179_whatsapp_contactos_y_rapidas.sql: se pierden los mensajes rápidos y los nombres personalizados de los chats (los chats y sus mensajes no se tocan).
drop table if exists whatsapp_respuestas_rapidas;
alter table whatsapp_conversaciones drop column if exists nombre_personalizado;
