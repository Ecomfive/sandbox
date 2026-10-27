-- Reversa de 0165_publicaciones_pausadas.sql: las pausadas quedan como archivadas comunes.
alter table dropi_publicaciones drop column if exists pausada_en;
