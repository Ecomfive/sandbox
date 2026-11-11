-- Reversa de 0267_drop_costo_manual.sql: se pierden los costos escritos a mano en Gestión de IDs Drop.

alter table drop_publicaciones drop column if exists costo_manual;
