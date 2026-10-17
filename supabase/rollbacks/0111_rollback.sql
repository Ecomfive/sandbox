-- Reversa de la migración 0111: quita el plazo de exclusividad de las sugerencias.
alter table sugerencias_clientes drop constraint if exists sugerencias_clientes_exclusividad_dias_check;
alter table sugerencias_clientes drop column if exists exclusividad_dias;
