-- Reversa de 0230 (Gestión de IDs Effi).
drop table if exists effi_publicaciones;
delete from permisos_rol where modulo = 'publicaciones-effi';
delete from permisos_persona where modulo = 'publicaciones-effi';
