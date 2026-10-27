-- Reversa de 0166_rendimiento_minutos.sql.
delete from permisos_rol where modulo = 'rendimiento';
drop table if exists actividad_minutos;
