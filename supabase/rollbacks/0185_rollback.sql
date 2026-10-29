-- Reversa de 0185_whatsapp_etiquetas.sql: quita las etiquetas de los chats y sus colores.
drop table if exists whatsapp_etiquetas;
drop index if exists whatsapp_conversaciones_etiquetas_idx;
alter table whatsapp_conversaciones drop column if exists etiquetas;
