-- Reversa de 0145_dropi_republicar.sql. Borra las republicaciones de la cola (las publicaciones que ya se crearon quedan).
drop index if exists dropi_cambios_pendientes_republicar_idx;
delete from dropi_cambios_pendientes where tipo = 'republicar';
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check check (nombre is not null or precio is not null or precio_sugerido is not null);
alter table dropi_cambios_pendientes
  drop column if exists nueva_publicacion_id,
  drop column if exists nuevo_dropi_id,
  drop column if exists tipo;
