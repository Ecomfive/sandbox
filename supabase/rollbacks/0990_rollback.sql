-- Reversa de 0990. Lo ya aprobado sigue en el WMS (los movimientos no se deshacen).
drop table if exists fin_ajustes_inventario;
delete from fin_config where clave = 'inventario_consignacion';
delete from fin_tipos t
where t.nombre = 'Provisión por inventario obsoleto'
  and not exists (select 1 from fin_movimientos m where m.tipo_id = t.id);
