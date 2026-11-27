-- Avisos de atención al cliente (26 nov 2026):
-- 1) Monday: cuando el cliente pide en dos tiendas, despacho lleva los dos pedidos en una sola fila («CS19288 / 1921», con la tienda de uno solo) y el
--    sistema no unía ninguno: el pedido de Kenku seguía «en ruta» aunque ya se había entregado. `otras_ordenes` guarda los demás pedidos de la fila
--    (el principal sigue en `orden_id`); la entrega cuenta para todos.
-- 2) Pedidos nuevos «En espera» (manual ATC): con `pone_en_espera` encendido en la tienda, cada pedido nuevo de Shopify queda en espera y con la etiqueta
--    «por confirmar datos» hasta que la asesora lo confirma desde el sistema. Apagado de entrada: lo enciende un administrador en Tiendas Shopify.
-- Se puede correr más de una vez. Reversa: supabase/rollbacks/0369_rollback.sql

alter table mon_despachos add column if not exists otras_ordenes uuid[];
create index if not exists mon_despachos_otras_ordenes on mon_despachos using gin (otras_ordenes) where otras_ordenes is not null;
comment on column mon_despachos.otras_ordenes is 'Los demás pedidos de una fila con varios números (el cliente pidió en dos tiendas y salió en un solo reparto). El principal está en orden_id.';

alter table tiendas add column if not exists pone_en_espera boolean not null default false;
alter table tiendas add column if not exists pone_en_espera_por uuid references perfiles(id) on delete set null;
alter table tiendas add column if not exists pone_en_espera_en timestamptz;
comment on column tiendas.pone_en_espera is 'Manual ATC: los pedidos nuevos de Shopify entran «En espera» y con «por confirmar datos» hasta que la asesora confirma.';

notify pgrst, 'reload schema';

-- Revisión: las dos deben decir «sí».
select
  case when exists (select 1 from information_schema.columns where table_name = 'mon_despachos' and column_name = 'otras_ordenes') then 'sí' else 'NO' end as otras_ordenes,
  case when exists (select 1 from information_schema.columns where table_name = 'tiendas' and column_name = 'pone_en_espera') then 'sí' else 'NO' end as pone_en_espera;
