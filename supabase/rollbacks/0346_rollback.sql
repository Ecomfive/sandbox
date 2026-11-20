-- Reversa de 0346_meta_lecturas_tramos.sql: quita el registro de lecturas y la función de cobertura (Cuentas › Historial vuelve a no mostrar el cuadro por mes).
drop function if exists meta_cobertura(uuid, date, date);
drop table if exists meta_lecturas_tramos;
