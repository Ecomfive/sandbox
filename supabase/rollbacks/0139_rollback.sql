-- Reversa de 0139_dropi_cambios_precio.sql. Borra los cambios que solo eran de precio (sin nombre) antes de volver a exigir el nombre.
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
delete from dropi_cambios_pendientes where nombre is null;
alter table dropi_cambios_pendientes
  drop column if exists precio,
  drop column if exists precio_sugerido,
  drop column if exists precio_antes,
  drop column if exists precio_sugerido_antes;
alter table dropi_cambios_pendientes alter column nombre set not null;
