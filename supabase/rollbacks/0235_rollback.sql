-- Reversa de 0235_traslados_y_sumar.sql: se pierde el historial de traslados, no el stock (ya se movió) ni sus movimientos.

drop function if exists wms_sumar_levantamiento(uuid, jsonb, text, uuid);
drop function if exists wms_crear_traslado(uuid, uuid, jsonb, text, uuid, text);
drop table if exists wms_traslado_items;
drop table if exists wms_traslados;
drop sequence if exists wms_traslados_numero_seq;
