-- Guarda el valor anterior y el nuevo por campo cambiado, para mostrar
-- "Campo: antes -> despues" en el historial de auditoria (antes solo
-- guardaba una frase libre en "detalle").
alter table historial_auditoria
  add column if not exists antes jsonb,
  add column if not exists despues jsonb;
