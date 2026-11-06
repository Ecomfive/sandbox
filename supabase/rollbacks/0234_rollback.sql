-- Reversa de 0234_drop_competencia.sql: borra las lecturas del catálogo de Drop. Las de Dropi (`competencia_*`) no se tocan.
drop table if exists drop_competencia_alertas;
drop table if exists drop_competencia_historial;
drop table if exists drop_competencia_productos;
drop table if exists drop_competencia_busquedas;
