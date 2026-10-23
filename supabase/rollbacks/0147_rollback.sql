-- Reversa de 0147_publicaciones_duplicadas.sql. Las duplicadas quedan como publicaciones archivadas comunes.
alter table dropi_publicaciones drop constraint if exists dropi_publicaciones_duplicada_de_check;
alter table dropi_publicaciones drop column if exists duplicada_de;
