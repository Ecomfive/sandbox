-- Reversa de 0309_retiros_solo_comision.sql: se pierde la marca de retiro fallido (los retiros quedan como estaban, con su monto y comisión).

alter table retiros drop column if exists solo_comision;
