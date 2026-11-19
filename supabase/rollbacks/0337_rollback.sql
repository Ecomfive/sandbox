-- Reversa de 0337: se borran los eventos de etiquetas del historial, el tipo vuelve a lo de antes y se quita el interruptor de escritura de las tiendas.
delete from ven_orden_eventos where tipo = 'etiqueta';
alter table ven_orden_eventos drop constraint if exists ven_orden_eventos_tipo_check;
alter table ven_orden_eventos add constraint ven_orden_eventos_tipo_check check (tipo in ('fase', 'cobro', 'remesa', 'nota'));
alter table tiendas drop column if exists escribe_shopify_en;
alter table tiendas drop column if exists escribe_shopify_por;
alter table tiendas drop column if exists escribe_shopify;
notify pgrst, 'reload schema';
