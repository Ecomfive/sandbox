-- Reversa de 0302_cuanto_hay.sql: borra las preguntas y los permisos de «¿Cuánto hay?».
delete from permisos_persona where modulo = 'despacho-cuanto-hay';
delete from permisos_rol where modulo in ('tienda-cuanto-hay', 'despacho-cuanto-hay');
drop table if exists tienda_cuanto_hay;
notify pgrst, 'reload schema';
