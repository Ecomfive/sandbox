-- Reversa de 0215_tareas_equipo.sql: borra las tareas del equipo y el permiso del módulo «tareas».
delete from permisos_rol where modulo = 'tareas';
drop table if exists tareas_equipo;
drop sequence if exists tareas_equipo_numero_seq;
