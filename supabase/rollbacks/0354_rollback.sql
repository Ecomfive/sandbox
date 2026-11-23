-- Reversa de 0354: quita las columnas de archivado (los pedidos archivados vuelven a verse en la lista).
drop index if exists despacho_pedidos_inventario_archivado;
alter table despacho_pedidos_inventario
  drop column if exists archivado_en,
  drop column if exists archivado_por,
  drop column if exists archivado_por_nombre;
notify pgrst, 'reload schema';
