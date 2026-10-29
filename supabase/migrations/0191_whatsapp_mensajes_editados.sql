-- CRM › WhatsApp: mensajes editados (pedido de Jhokser, 30 oct 2026). Cuando alguien edita un mensaje en WhatsApp (el cliente, o el equipo desde la app del celular, dentro de los 15
-- minutos), Meta manda un aviso `type: edit` con el id del original y el texto nuevo, no un mensaje nuevo. Antes salía como «Mensaje de tipo «edit» que el sistema todavía no sabe
-- mostrar». Ahora el mensaje original se queda con el texto nuevo y se guarda aquí lo que decía antes y cuándo se editó; la bandeja lo marca «editado». Nada se pierde:
-- una segunda edición no pisa `texto_antes`.
-- Código: src/lib/whatsapp/guardar.ts (guardarEditados). Reversa: supabase/rollbacks/0191_rollback.sql

alter table whatsapp_mensajes add column if not exists editado_en timestamptz;
alter table whatsapp_mensajes add column if not exists texto_antes text;
