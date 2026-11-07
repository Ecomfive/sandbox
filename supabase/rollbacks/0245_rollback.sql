-- Reversa de 0245_levantamiento_restar.sql: se pierde la función, no lo que ya se restó (sus movimientos quedan en el libro).

drop function if exists wms_restar_levantamiento(uuid, jsonb, text, uuid);
