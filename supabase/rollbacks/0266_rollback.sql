-- Reversa de 0266_precios_drop_dunamixfy.sql: borra la cola de cambios de precio y las columnas de precios leídos de Drop (los precios ya puestos en Drop y
-- en Dunamixfy se quedan como están allá).
drop table if exists plataforma_cambios_precio;
alter table drop_publicaciones drop column if exists precios_leidos_en;
alter table drop_publicaciones drop column if exists con_variantes;
alter table drop_publicaciones drop column if exists precio_sugerido;
alter table drop_publicaciones drop column if exists precio_proveedor;
