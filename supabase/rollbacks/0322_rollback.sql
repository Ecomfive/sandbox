-- Reversa de 0322_historial_clientes.sql.
drop function if exists ven_historial_clientes(text[], uuid[]);
notify pgrst, 'reload schema';
