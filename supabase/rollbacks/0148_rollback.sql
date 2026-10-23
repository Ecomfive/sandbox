-- Reversa de 0148: quita los apagados y vuelve a dos tipos de cambio.
drop index if exists dropi_cambios_pendientes_apagar_idx;
delete from dropi_cambios_pendientes where tipo = 'apagar';
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check
  check (tipo = 'republicar' or nombre is not null or precio is not null or precio_sugerido is not null);
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_tipo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_tipo_check check (tipo in ('cambio', 'republicar'));
alter table dropi_cambios_pendientes drop column if exists quitar_privados;
