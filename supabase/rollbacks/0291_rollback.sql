-- Reversa de 0291_salida_manual_permiso.sql: quita el módulo «Salida a mano» a quien lo tenga.
delete from permisos_persona where modulo = 'salida-manual';
