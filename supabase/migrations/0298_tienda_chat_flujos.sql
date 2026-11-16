-- Pausar los flujos de un chat de WhatsApp de tienda (14 nov 2026, pedido de Hernán). iComfly separa, por chat, «La IA» (responde sola) y «Los flujos» (los mensajes
-- programados y las plantillas automáticas). La IA ya se anotaba (`bot_pausado`); ahora también los flujos, porque el conector pausa pero no dice cómo está.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0298_rollback.sql.
alter table tienda_chat_conversaciones add column if not exists flujos_pausados boolean not null default false;
alter table tienda_chat_conversaciones add column if not exists flujos_pausado_por text;
alter table tienda_chat_conversaciones add column if not exists flujos_pausado_en timestamptz;

notify pgrst, 'reload schema';
