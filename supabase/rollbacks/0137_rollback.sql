-- Reversa de 0137_dropi_conexion.sql: borra la cola de cambios (los nombres ya puestos en Dropi y en las publicaciones se quedan
-- como están). NO toca `dropi_sesiones`: esa tabla es de la 0028 (estado de la renovación de la sesión) y la 0137 no la creó.
drop table if exists dropi_cambios_pendientes;
