-- Gestión de IDs Dropi › «Aplicar en Dropi» también cambia precios (22 oct 2026): al aceptar «Subir precio» o «Bajar precio frente a
-- la competencia», o al cambiar el precio en la ficha, el precio nuevo queda en la misma cola que los nombres y lo aplica el favorito
-- desde la pestaña de Dropi. Un cambio puede llevar nombre, precio, precio sugerido o varios a la vez (lo que no lleva, no se toca).
-- Reversa: supabase/rollbacks/0139_rollback.sql

alter table dropi_cambios_pendientes alter column nombre drop not null;
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_nombre_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_nombre_check check (nombre is null or char_length(nombre) between 1 and 40);

alter table dropi_cambios_pendientes
  add column if not exists precio numeric(12, 2) check (precio is null or precio > 0),
  add column if not exists precio_sugerido numeric(12, 2) check (precio_sugerido is null or precio_sugerido > 0),
  -- Lo que tenía antes, para mostrar «de $4.99 a $5.29» al aplicar.
  add column if not exists precio_antes numeric(12, 2),
  add column if not exists precio_sugerido_antes numeric(12, 2);

alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check check (nombre is not null or precio is not null or precio_sugerido is not null);
