-- Reversa de 0287_monday_devoluciones.sql: se deja de leer el tablero de devoluciones de Kenku y se quitan los datos de los asesores. Los pedidos que volvieron a
-- despachados no se tocan (volverán a devueltos solo si Monday o Servientrega lo registran).
delete from mon_despachos where tablero_id = '18429046458';
delete from mon_tableros_extra where tablero_id = '18429046458';
alter table mon_despachos drop column if exists observaciones_asesores;
alter table mon_despachos drop column if exists estado_asesores;
notify pgrst, 'reload schema';
