-- Reversa de 0363: se deja de leer el tablero de prueba, se archivan sus filas (no se borran) y la cuenta de prueba vuelve a JULY CALLE.
update mon_despachos set archivado_en = now(), orden_id = null where tablero_id = '18441424577' and archivado_en is null;
delete from mon_tableros_extra where tablero_id = '18441424577';
update despacho_repartidores set courier = 'JULY CALLE' where id = '01a20f7b-74d5-79cd-9db5-5d23bd0e0d30';
alter table mon_tableros_extra drop column if exists prueba;
notify pgrst, 'reload schema';
