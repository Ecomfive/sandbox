-- Reversa de 0290_monday_postventa.sql: deja de leer el tablero de cambios y reembolsos y borra lo leído.
delete from mon_tableros_extra where tablero_id = '2693664405';
drop table if exists mon_postventa;
alter table mon_tableros_extra drop constraint if exists mon_tableros_extra_clase_check;
alter table mon_tableros_extra drop column if exists clase;
notify pgrst, 'reload schema';
