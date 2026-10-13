-- Reversa de la migración 0102: quita el permiso del módulo «Fuente de datos» a todos los roles.
delete from permisos_rol where modulo = 'fuente-datos';
