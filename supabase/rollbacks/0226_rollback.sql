-- Reversa de 0226_dropi_productos_variaciones.sql: «Privatizar en Dropi» deja de ofrecer las unidades por variación.

alter table dropi_productos_proveedor drop column if exists variaciones;
