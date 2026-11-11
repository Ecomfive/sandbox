-- Reversa de 0265_quitar_cajas.sql: devuelve las cajas guardadas en el respaldo (las que no estén ya en `wms_cajas`). Revisa antes que sigan cuadrando con el stock.

insert into wms_cajas (id, bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja, cajas, observacion, actualizado_por, actualizado_en)
select id, bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja, cajas, observacion, actualizado_por, actualizado_en
from wms_cajas_respaldo
on conflict do nothing;
