-- Reversa de 0183_whatsapp_actividad_productos.sql: se pierden los productos y la versión del análisis (los motivos y resúmenes quedan).
alter table whatsapp_actividad drop column if exists productos;
alter table whatsapp_actividad drop column if exists version;
