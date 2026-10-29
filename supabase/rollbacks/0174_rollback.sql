-- Reversa de 0174_publicaciones_liquidacion.sql: las publicaciones en liquidación vuelven a contar como margen bajo.
alter table dropi_publicaciones drop column if exists liquidacion_en;
