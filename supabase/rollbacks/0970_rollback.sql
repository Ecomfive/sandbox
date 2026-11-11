-- Reversa de 0970_quitar_variante_sin_saldo.sql: sin la función, «Quitar» vuelve a aceptar solo variantes sin movimientos.
drop function if exists wms_quitar_variante(uuid);
