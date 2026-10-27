-- Reversa de 0160: devuelve a cada publicación el fulfillment que tenía antes (lo guarda el comentario «Fulfillment fijo» de su
-- Actividad), quita esos comentarios y el valor por defecto.
update dropi_publicaciones p
set fulfillment = case when c.texto like 'Fulfillment: sin dato%' then null else substring(c.texto from '^Fulfillment: \$([0-9.]+) ')::numeric end
from (select distinct on (publicacion_id) publicacion_id, texto from dropi_publicacion_comentarios where autor = 'Fulfillment fijo' order by publicacion_id, creado_en) c
where c.publicacion_id = p.id;

delete from dropi_publicacion_comentarios where autor = 'Fulfillment fijo';

alter table dropi_publicaciones alter column fulfillment drop default;
