-- Fecha en que Dropi aprobó el retiro — paso "Aprobado" de la barra de pasos de la ficha, simétrico a
-- fecha_rechazo (migración 0044). La pone scripts/dropi-ingerir-retiros.ts cuando estado_dropi pasa a
-- "aprobado".
alter table retiros add column if not exists fecha_aprobado date;

-- Fecha en que se creó la novedad vigente del retiro — paso "Novedad" de la barra de pasos. La pone
-- agregarNovedadRetiro (cuando se agrega a mano) y scripts/dropi-ingerir-retiros.ts (cuando Dropi rechaza
-- un retiro que seguía abierto y se marca como novedad para revisar).
alter table retiros add column if not exists fecha_novedad date;
