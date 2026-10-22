-- Reversa de 0137_dropi_conexion.sql: borra la sesión de Dropi guardada y la cola de cambios (los nombres ya puestos en Dropi y en
-- las publicaciones se quedan como están).
drop table if exists dropi_cambios_pendientes;
drop table if exists dropi_sesiones;
