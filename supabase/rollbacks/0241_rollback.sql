-- Reversa de 0241_actividad_dispositivo.sql: borra de qué dispositivo vino cada minuto. Los minutos se conservan.
alter table actividad_minutos drop column if exists dispositivo;
