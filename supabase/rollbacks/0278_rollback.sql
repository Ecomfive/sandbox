-- Reversa de 0278_tienda_confirmacion.sql: se quita el módulo Confirmación de tienda de todos los roles.

delete from permisos_rol where modulo = 'tienda-confirmacion';
