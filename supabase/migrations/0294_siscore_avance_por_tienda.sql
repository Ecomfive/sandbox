-- Logística › «Actualizar Servientrega» (SISCORE) por tienda y con su avance (14 nov 2026, pedido de Hernán: «necesito saber cuándo se está
-- actualizando, un porcentaje… que estén separadas las actualizaciones: si abro Kenku, que se actualice Kenku; si abro Oferfy, Oferfy»).
--   * cada lectura guarda su tienda (la cuenta de SISCORE abierta) y cuántas guías lleva de cuántas, con la hora del último avance;
--   * una lectura en curso solo frena otra de la misma tienda, y solo mientras siga avanzando (2 minutos sin avanzar = abandonada);
--   * las lecturas viejas se asignan a su tienda por el cliente de SISCORE, y las que quedaron «corriendo» se cierran.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0294_rollback.sql
alter table tienda_guias_lecturas add column if not exists tienda_id uuid references tiendas(id) on delete set null;
alter table tienda_guias_lecturas add column if not exists hechos integer not null default 0 check (hechos >= 0);
alter table tienda_guias_lecturas add column if not exists total integer not null default 0 check (total >= 0);
alter table tienda_guias_lecturas add column if not exists avance_en timestamptz;
create index if not exists tienda_guias_lecturas_tienda on tienda_guias_lecturas (tienda_id, inicio desc);

update tienda_guias_lecturas l set tienda_id = t.id
from tiendas t
where l.tienda_id is null and l.cliente is not null and upper(t.nombre) = upper(l.cliente);

update tienda_guias_lecturas
set estado = 'error', fin = coalesce(fin, now()), error = 'Quedó sin terminar (se cerró la pestaña o se cortó).'
where estado = 'corriendo' and inicio < now() - interval '15 minutes';

notify pgrst, 'reload schema';
