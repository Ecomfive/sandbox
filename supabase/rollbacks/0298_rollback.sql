-- Reversa de 0298: quita lo anotado de los flujos pausados de los chats de tienda.
alter table tienda_chat_conversaciones drop column if exists flujos_pausado_en;
alter table tienda_chat_conversaciones drop column if exists flujos_pausado_por;
alter table tienda_chat_conversaciones drop column if exists flujos_pausados;

notify pgrst, 'reload schema';
