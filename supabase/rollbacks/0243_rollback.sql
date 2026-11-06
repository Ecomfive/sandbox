-- Reversa de 0243_novedades_plataforma.sql. Borra las novedades registradas: revísalas antes de correrla.

drop table if exists wms_novedades_plataforma;

notify pgrst, 'reload schema';
