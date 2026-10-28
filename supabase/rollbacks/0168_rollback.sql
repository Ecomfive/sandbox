-- Reversa de 0168_whatsapp_area_por_conversacion.sql: el área vuelve a ser solo del número. Después de correrla, volver a correr la
-- función whatsapp_kpis de 0164 (la de 0168 lee la columna que aquí se borra).
drop trigger if exists whatsapp_conversacion_area_inicial on whatsapp_conversaciones;
drop function if exists whatsapp_conversacion_area_inicial();
drop index if exists whatsapp_conversaciones_area_idx;
alter table whatsapp_conversaciones drop constraint if exists whatsapp_conversaciones_area_check;
alter table whatsapp_conversaciones drop column if exists area;
