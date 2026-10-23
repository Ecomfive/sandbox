-- Gestión de IDs Dropi › deshacer un cambio pendiente (pedido de Hernán, 23 oct 2026): al dejar pendiente un cambio de nombre, se guarda
-- cómo se llamaba la publicación antes, para que «Deshacer» en la lista de cambios pendientes devuelva el nombre anterior. Es el de la
-- primera vez que se pidió el cambio (si se cambia dos veces antes de aplicar, vuelve al original). Los pendientes que ya existían no lo
-- tienen: al deshacerlos se quita el cambio de la cola pero el nombre se queda como está.
-- Reversa: supabase/rollbacks/0149_rollback.sql

alter table dropi_cambios_pendientes add column if not exists nombre_antes text;
