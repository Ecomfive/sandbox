-- Reversa de la migración 0109: quita Sugerencias de clientes. ATENCIÓN: borra todas las sugerencias y las filas de Selección
-- que vinieron de ellas (fuente 'sugerencia_cliente'), porque la restricción de fuente vuelve a no admitirlas.
delete from permisos_rol where modulo = 'sugerencias-clientes';
drop index if exists wms_seleccion_productos_sugerencia_uidx;
alter table wms_seleccion_productos drop column if exists sugerencia_id;
drop table if exists sugerencias_clientes;
delete from wms_seleccion_productos where fuente = 'sugerencia_cliente';
delete from wms_fuente_correlativos where fuente = 'sugerencia_cliente';

alter table wms_fuente_correlativos drop constraint if exists wms_fuente_correlativos_fuente_check;
alter table wms_fuente_correlativos
  add constraint wms_fuente_correlativos_fuente_check check (fuente in ('drop_killer', 'tu_winner', 'scraping_proveedores', 'manual'));
alter table wms_seleccion_productos drop constraint if exists wms_seleccion_productos_fuente_check;
alter table wms_seleccion_productos
  add constraint wms_seleccion_productos_fuente_check check (fuente in ('drop_killer', 'tu_winner', 'scraping_proveedores', 'manual'));
