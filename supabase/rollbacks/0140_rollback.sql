-- Reversa de 0140_publicaciones_no_se_borran.sql: vuelve a permitir borrar publicaciones (contra la regla de archivar siempre; solo
-- si Hernán lo pide). `dropi_conexiones` no se vuelve a crear: no se usa (si hiciera falta, está en 0138).
drop trigger if exists dropi_publicaciones_no_borrar on dropi_publicaciones;
drop function if exists dropi_publicaciones_no_borrar();
