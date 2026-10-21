-- Gestión de publicaciones Dropi: una publicación puede tener varios responsables (pedido de Hernán, 21 oct 2026), como en
-- ClickUp, donde una tarea tenía a veces a dos personas. `responsables` guarda a todos en orden; `responsable_id` sigue siendo
-- el primero (lo mantiene la app) para que nada que lo lea deje de funcionar. Se puede repetir.

alter table dropi_publicaciones add column if not exists responsables uuid[] not null default '{}';

-- Las que ya tenían responsable lo pasan a la lista.
update dropi_publicaciones
set responsables = array[responsable_id]
where responsable_id is not null and responsables = '{}';

-- Para filtrar «las de una persona» (responsables @> array[id]).
create index if not exists dropi_publicaciones_responsables_idx on dropi_publicaciones using gin (responsables);
