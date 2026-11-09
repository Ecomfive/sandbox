-- Quitar las cajas por ahora (9 nov 2026, pedido de Hernán: «es un poco complejo tener que estar variando la cantidad de producto que tiene una caja… puede haber
-- confusión»). Las líneas de `wms_cajas` (0236) se copian a `wms_cajas_respaldo` y se vacía la tabla: sin cajas guardadas, el Inventario, las Remisiones, los
-- Traslados y la ficha vuelven a ir solo por unidades, y la remisión no pide elegir cajas. El stock no cambia (está en `wms_stock`). Se puede correr más de una vez.
-- Para volver a tenerlas: supabase/rollbacks/0265_rollback.sql (las devuelve desde el respaldo).

create table if not exists wms_cajas_respaldo (like wms_cajas including all);
alter table wms_cajas_respaldo add column if not exists respaldado_en timestamptz not null default now();
alter table wms_cajas_respaldo enable row level security;

insert into wms_cajas_respaldo (id, bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja, cajas, observacion, actualizado_por, actualizado_en)
select id, bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja, cajas, observacion, actualizado_por, actualizado_en
from wms_cajas
on conflict do nothing;

delete from wms_cajas where id in (select id from wms_cajas_respaldo);

notify pgrst, 'reload schema';
