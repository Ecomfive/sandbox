-- Reversa de la migración 0110: quita los vínculos del recorrido y el estado «En test» (las filas en ese estado vuelven a
-- «Crear oferta» para que la restricción se pueda crear).
drop index if exists wms_compras_sku_idx;
alter table wms_compras drop column if exists sku_maestro_id;
drop index if exists wms_productos_test_seleccion_uidx;
alter table wms_productos_test drop column if exists seleccion_id;
update wms_seleccion_productos set estado = 'crear_oferta' where estado = 'en_test';
alter table wms_seleccion_productos drop constraint if exists wms_seleccion_productos_estado_check;
alter table wms_seleccion_productos
  add constraint wms_seleccion_productos_estado_check check (estado in ('seleccionado', 'crear_oferta', 'descartado'));
