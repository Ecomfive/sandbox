-- Compras: el costo unitario de cada producto de una orden con hasta 10 decimales (antes 4). Con 4, un total escrito no se
-- podía reproducir: 1.040 u. por $1.270 dan $1,2211538462 por unidad; guardado como 1,2212 el total volvía a ser $1.270,05
-- (OC-0578, reportado por Hernán). El total se sigue mostrando en centavos.

alter table wms_compra_items alter column costo_unitario type numeric(24, 10);
