-- Cuándo llegó de verdad el dinero al banco, para poder distinguirlo de cuándo se concilió el retiro en el
-- sistema (fecha_cierre, que ahora es la fecha de consolidado): a veces se valida contra el banco un día
-- distinto al que se hace la conciliación, así que esta fecha se escribe a mano al conciliar.
alter table retiros add column if not exists fecha_recibido date;
