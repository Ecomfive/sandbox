-- Reversa de 0224 (Gestión de tienda): quita los permisos de sus cuatro módulos y sus tablas (todavía sin datos de Shopify).
delete from permisos_rol where modulo in ('tienda-dashboard', 'tienda-pedidos', 'tienda-productos', 'tienda-tiendas');
delete from permisos_persona where modulo in ('tienda-dashboard', 'tienda-pedidos', 'tienda-productos', 'tienda-tiendas');
drop table if exists tienda_avisos;
drop table if exists tienda_pedido_notas;
drop table if exists tienda_pedido_lineas;
drop table if exists tienda_pedidos;
drop table if exists tienda_variantes;
drop table if exists tiendas;
