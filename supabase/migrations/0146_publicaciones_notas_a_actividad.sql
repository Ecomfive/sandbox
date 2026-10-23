-- Gestión de IDs Dropi: las «Notas» salen de la ficha y lo que había escrito pasa a la Actividad (23 oct 2026, pedido de Hernán).
-- Cada publicación con una nota recibe un comentario con ese texto (autor «Notas anteriores», con la fecha en que se creó la
-- publicación, así queda al fondo de su actividad) y la columna `notas` queda vacía. La columna se conserva: la ficha ya no la lee
-- ni la escribe. Se puede correr de nuevo sin efecto (una vez vaciada, no hay nada que pasar).
-- Reversa: supabase/rollbacks/0146_rollback.sql

insert into dropi_publicacion_comentarios (publicacion_id, autor, texto, creado_en)
select id, 'Notas anteriores', btrim(notas), coalesce(creado_en, now())
from dropi_publicaciones
where notas is not null and btrim(notas) <> '';

update dropi_publicaciones set notas = null where notas is not null and btrim(notas) <> '';
