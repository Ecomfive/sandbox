-- Reversa de 0146: devuelve a `dropi_publicaciones.notas` lo que pasó a la Actividad como «Notas anteriores» y quita esos comentarios.
update dropi_publicaciones p set notas = c.texto
from (select distinct on (publicacion_id) publicacion_id, texto from dropi_publicacion_comentarios where autor = 'Notas anteriores' order by publicacion_id, creado_en) c
where c.publicacion_id = p.id and p.notas is null;
delete from dropi_publicacion_comentarios where autor = 'Notas anteriores';
