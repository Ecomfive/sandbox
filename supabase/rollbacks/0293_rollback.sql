-- Reversa de 0293_monday_devoluciones_oferfy.sql: deja de leer el tablero de devoluciones de Oferfy y borra sus filas leídas.
-- Los pedidos que ya pasaron a devueltos o cancelados no se tocan (su historial guarda el cambio).
delete from mon_despachos where tablero_id = '18429046262';
delete from mon_tableros_extra where tablero_id = '18429046262';
notify pgrst, 'reload schema';
