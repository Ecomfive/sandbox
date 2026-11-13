-- Reversa de 0282_monday_tableros_repartidores.sql: se dejan de leer los tableros de los repartidores. Lo que ya se guardó de ellos en mon_despachos
-- queda (se puede borrar con: delete from mon_despachos where tablero_id in (select tablero_id from mon_tableros_extra); antes de esta reversa).

drop table if exists mon_tableros_extra;
