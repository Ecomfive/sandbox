-- Reversa de 0277_drop_exclusivos.sql: se pierde lo leído de los exclusivos de Drop (se vuelve a leer con la extensión).

alter table drop_publicaciones drop column if exists exclusivos;
alter table drop_publicaciones drop column if exists inventario_exclusivo;
