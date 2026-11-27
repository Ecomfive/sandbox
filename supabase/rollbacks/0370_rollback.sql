-- Reversa de 0370_meta_notas.sql: borra las notas de Anuncios Meta (se pierden las que haya).
drop table if exists meta_notas;
notify pgrst, 'reload schema';
