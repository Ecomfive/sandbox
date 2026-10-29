-- Reversa de 0189_whatsapp_prioridad.sql: quita la prioridad de los chats (motivo, espera y correcciones).
drop table if exists whatsapp_motivo_correcciones;
drop trigger if exists whatsapp_mensajes_espera on whatsapp_mensajes;
drop function if exists whatsapp_marcar_espera();
drop index if exists whatsapp_conversaciones_esperando_idx;
alter table whatsapp_conversaciones drop column if exists motivo_pedido_en;
alter table whatsapp_conversaciones drop column if exists motivo_en;
alter table whatsapp_conversaciones drop column if exists motivo_por_nombre;
alter table whatsapp_conversaciones drop column if exists motivo_por;
alter table whatsapp_conversaciones drop column if exists motivo_resumen;
alter table whatsapp_conversaciones drop column if exists motivo;
alter table whatsapp_conversaciones drop column if exists motivo_grupo;
alter table whatsapp_conversaciones drop column if exists esperando_desde;
