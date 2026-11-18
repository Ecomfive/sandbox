-- Deshace 0316: la vista y la función vuelven a como estaban (0909 y 0934) y se quitan las columnas.
-- Correr primero la definición de ven_lineas_costo de 0909 y la de fin_ue_lineas de 0934 (create or replace), y después:
alter table ven_orden_lineas drop constraint if exists ven_orden_lineas_unidades_por_venta_check;
alter table tienda_variantes drop constraint if exists tienda_variantes_unidades_por_venta_check;
alter table ven_orden_lineas drop column if exists unidades_por_venta;
alter table tienda_variantes drop column if exists unidades_por_venta;
