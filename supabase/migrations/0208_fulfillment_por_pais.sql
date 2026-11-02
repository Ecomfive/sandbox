-- Fulfillment por país (pedido de Hernán, 31 oct 2026): el costo de fulfillment por pedido ya no está fijo en el código ($1.50 solo en Panamá),
-- es un dato de cada país que se cambia en Bodegas («Fulfillment por pedido»). Al cambiarlo, todas las publicaciones de Gestión de IDs Dropi
-- de ese país toman el valor nuevo (`guardarFulfillmentPais`, src/app/(app)/wms-bodegas/fulfillment-actions.ts) y las nuevas lo traen; null =
-- en ese país se escribe en cada publicación, como antes. Panamá queda en $1.50 y Costa Rica pasa a $2.00: sus publicaciones cambian ya, con el
-- valor de antes en su Actividad (autor «Fulfillment del país»); la utilidad y el margen se recalculan solos (columnas generadas).
-- Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0208_rollback.sql

alter table paises add column if not exists fulfillment numeric(10, 2);
alter table paises drop constraint if exists paises_fulfillment_check;
alter table paises add constraint paises_fulfillment_check check (fulfillment is null or (fulfillment >= 0 and fulfillment < 1000));

update paises set fulfillment = 1.5 where codigo = 'PA' and fulfillment is null;
update paises set fulfillment = 2 where codigo = 'CR' and fulfillment is distinct from 2;

-- Costa Rica a $2.00: lo que cambia queda en la Actividad de cada publicación.
insert into dropi_publicacion_comentarios (publicacion_id, autor, texto)
select p.id, 'Fulfillment del país',
  'Fulfillment: ' || coalesce('$' || to_char(p.fulfillment, 'FM999999990.00'), 'sin dato') || ' → $2.00 (el de Costa Rica)'
from dropi_publicaciones p
join paises x on x.id = p.pais_id
where x.codigo = 'CR' and p.fulfillment is distinct from 2;

update dropi_publicaciones p set fulfillment = 2
from paises x
where x.id = p.pais_id and x.codigo = 'CR' and p.fulfillment is distinct from 2;
