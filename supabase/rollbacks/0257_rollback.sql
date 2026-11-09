-- Reversa de 0257_unir_productos_permiso.sql: quita el módulo «Unir productos duplicados» a quien lo tenga.
delete from permisos_persona where modulo = 'unir-productos';
