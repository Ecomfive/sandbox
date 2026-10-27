-- Gestión de IDs Dropi: el fulfillment es el mismo en todas las publicaciones, $1.50, y ya no se edita en la ficha ni al crear
-- (pedido de Hernán, 27 oct 2026; `FULFILLMENT_DROPI` en src/lib/publicaciones/publicacion.ts). Las que tenían otro valor o
-- ninguno pasan a 1.50 y su Actividad lo dice (autor «Fulfillment fijo», con el valor de antes); la utilidad y el margen se
-- recalculan solos (columnas generadas). Una publicación nueva lo trae por defecto. Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0160_rollback.sql

insert into dropi_publicacion_comentarios (publicacion_id, autor, texto)
select id, 'Fulfillment fijo',
  'Fulfillment: ' || coalesce('$' || to_char(fulfillment, 'FM999999990.00'), 'sin dato') || ' → $1.50 (igual en todas las publicaciones)'
from dropi_publicaciones
where fulfillment is distinct from 1.5;

update dropi_publicaciones set fulfillment = 1.5 where fulfillment is distinct from 1.5;

alter table dropi_publicaciones alter column fulfillment set default 1.5;
