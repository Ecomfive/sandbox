-- Reversa de 0304_pedidos_inventario.sql: borra los pedidos a inventario y sus permisos (los traslados hechos quedan).
delete from permisos_persona where modulo in ('despacho-pedir-inventario', 'inventario-pedidos-despacho');
delete from permisos_rol where modulo in ('despacho-pedir-inventario', 'inventario-pedidos-despacho');
drop table if exists despacho_pedidos_inventario_items;
drop table if exists despacho_pedidos_inventario;
notify pgrst, 'reload schema';
