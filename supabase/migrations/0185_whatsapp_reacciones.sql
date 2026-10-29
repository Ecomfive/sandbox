-- CRM › WhatsApp: las reacciones van sobre el mensaje al que se reaccionó (pedido de Hernán, 29 oct 2026), como en WhatsApp, y no como
-- un mensaje suelto «Reaccionó ❤️». Meta manda en cada reacción el id («wamid…») del mensaje reaccionado; se guarda aquí. La reacción
-- sigue siendo una fila de `whatsapp_mensajes` (tipo 'reaccion', texto = el emoji; sin emoji = la quitó) y la bandeja la dibuja sobre
-- el mensaje cuyo `wa_id` es `reaccion_a`. Las reacciones de antes no lo traen: la bandeja las pone sobre el último mensaje del otro lado.
-- Reversa: supabase/rollbacks/0185_rollback.sql

alter table whatsapp_mensajes add column if not exists reaccion_a text;

create index if not exists whatsapp_mensajes_reaccion_a_idx on whatsapp_mensajes (reaccion_a) where reaccion_a is not null;
