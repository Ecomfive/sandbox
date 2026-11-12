-- Reversa de 0279_tienda_logistica.sql: se quita el módulo Logística de tienda de todos los roles.

delete from permisos_rol where modulo = 'tienda-logistica';
