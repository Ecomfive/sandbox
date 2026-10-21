-- Quita la función de 0125_eliminar_producto.sql. Un producto ya borrado con ella no se recupera.
drop function if exists wms_eliminar_producto(uuid);
