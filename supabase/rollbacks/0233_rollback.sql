-- Reversa de 0233_remisiones_documento.sql: las líneas de `wms_envios_dropi` se quedan; solo pierden su número de remisión.

drop function if exists wms_crear_remision(uuid, uuid, jsonb, text, uuid);
drop index if exists wms_envios_dropi_remision;
alter table wms_envios_dropi drop column if exists remision_id;
drop table if exists wms_remisiones;
drop sequence if exists wms_remisiones_numero_seq;
