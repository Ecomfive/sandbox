-- Fecha en que Dropi rechazó el retiro — paso "Rechazado" de la barra de pasos de la ficha. No se guarda
-- para "aprobado": ese es el camino normal, que ya se ve avanzar por Recibido/Conciliado sin necesitar un
-- paso aparte. La pone scripts/dropi-ingerir-retiros.ts cada vez que estado_dropi pasa a "rechazado".
alter table retiros add column if not exists fecha_rechazo date;
