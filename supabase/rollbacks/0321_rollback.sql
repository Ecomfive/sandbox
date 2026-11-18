-- Reversa de 0321_indice_pedidos_tienda_fecha.sql.
drop function if exists ven_lineas_periodo(uuid[], date, date);
drop function if exists ven_pedidos_periodo(uuid[], date, date);
drop index if exists ven_ordenes_unidad_fecha;
notify pgrst, 'reload schema';
