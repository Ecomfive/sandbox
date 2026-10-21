-- Deshace 0123_publicaciones_correlativo.sql: quita el número correlativo de las publicaciones.
drop index if exists dropi_publicaciones_numero_unico;
alter table dropi_publicaciones drop column if exists numero;
drop sequence if exists dropi_publicaciones_numero_seq;
