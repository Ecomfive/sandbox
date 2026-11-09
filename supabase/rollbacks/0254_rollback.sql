-- Reversa de 0254_reservas_por_correo.sql: sin las reservas leídas ni el tipo «reserva» en la cola (las que esperen se descartan).
delete from dropi_cambios_pendientes where tipo = 'reserva';
drop index if exists dropi_cambios_pendientes_reserva_idx;
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_tipo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_tipo_check check (tipo in ('cambio', 'republicar', 'apagar', 'archivar', 'crear', 'privatizar', 'stock'));
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check
  check (tipo in ('republicar', 'apagar', 'archivar', 'crear', 'privatizar', 'stock') or nombre is not null or precio is not null or precio_sugerido is not null or descripcion is not null or fotos is not null);
alter table dropi_productos_proveedor drop column if exists reservas;
alter table dropi_productos_proveedor drop column if exists privado_producto;
