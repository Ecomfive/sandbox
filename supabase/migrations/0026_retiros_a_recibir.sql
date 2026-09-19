-- "A recibir": monto que se espera recibir por el retiro. Se escribe a mano al
-- crearlo (por defecto monto - comision) y es contra lo que se concilia el
-- monto recibido al consolidar. Los retiros anteriores toman su monto neto.

alter table retiros add column if not exists a_recibir numeric(12, 2);
update retiros set a_recibir = monto_neto where a_recibir is null;
