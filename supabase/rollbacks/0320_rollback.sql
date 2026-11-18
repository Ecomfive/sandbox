-- Reversa de 0320 (Anuncios Meta): quita las tablas y el módulo. Borra lo leído de Meta (se vuelve a leer al correr la migración y «Leer ahora»), los topes y las decisiones.
delete from permisos_rol where modulo = 'anuncios-meta';
drop table if exists meta_decisiones;
drop table if exists meta_topes;
drop table if exists meta_actividad;
drop table if exists meta_resultados_dia;
drop table if exists meta_anuncios;
drop table if exists meta_conjuntos;
drop table if exists meta_campanas;
drop table if exists meta_cuentas;
notify pgrst, 'reload schema';
