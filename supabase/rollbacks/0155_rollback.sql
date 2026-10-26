-- Reversa de 0155_dropi_privatizar.sql
drop index if exists dropi_cambios_pendientes_privatizar_idx;

-- Las privatizaciones de la cola no caben en la restricción de antes.
delete from dropi_cambios_pendientes where tipo = 'privatizar';

alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check
  check (tipo in ('republicar', 'apagar', 'archivar', 'crear') or nombre is not null or precio is not null or precio_sugerido is not null or descripcion is not null or fotos is not null);

alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_tipo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_tipo_check check (tipo in ('cambio', 'republicar', 'apagar', 'archivar', 'crear'));
