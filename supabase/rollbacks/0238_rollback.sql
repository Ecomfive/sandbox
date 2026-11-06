-- Reversa de 0238_effi_competencia.sql: borra las lecturas del catálogo de Effi. Las de Dropi y Drop no se tocan.
drop table if exists effi_competencia_alertas;
drop table if exists effi_competencia_historial;
drop table if exists effi_competencia_productos;
drop table if exists effi_competencia_busquedas;
