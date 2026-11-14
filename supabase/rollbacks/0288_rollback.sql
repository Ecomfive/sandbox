-- Reversa de 0288_monday_devoluciones.sql: deja de leer el tablero de devoluciones de Kenku y quita las columnas de los asesores.
-- Los pedidos que la 0288 devolvió a «despachada» no se tocan (su historial guarda el cambio).
delete from mon_tableros_extra where tablero_id = '18429046458';
alter table mon_despachos drop column if exists observaciones_asesores;
alter table mon_despachos drop column if exists estado_asesores;
notify pgrst, 'reload schema';
