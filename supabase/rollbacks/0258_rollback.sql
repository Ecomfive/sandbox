-- Reversa de 0258_variantes_foto_heredada.sql: quita los disparadores. Las fotos que las variantes ya copiaron se quedan (son la misma dirección que la del principal).
drop trigger if exists skus_maestros_foto_a_variantes on skus_maestros;
drop trigger if exists skus_maestros_foto_heredada on skus_maestros;
drop function if exists skus_maestros_foto_a_variantes();
drop function if exists skus_maestros_foto_heredada();
