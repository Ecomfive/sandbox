-- Quita las funciones de 0120_unir_productos_duplicados.sql. Lo que ya se hubiera unido con ellas no se puede separar.
drop function if exists wms_unir_productos(uuid, uuid, boolean);
drop function if exists _wms_unir_productos(uuid, uuid);
