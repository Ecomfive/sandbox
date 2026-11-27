-- Reversa de 0360: quita las marcas de archivo de las llegadas.
drop index if exists compras_llegada_items_archivado;
alter table compras_llegada_items
  drop column if exists archivado_en,
  drop column if exists archivado_por,
  drop column if exists archivado_por_nombre;
notify pgrst, 'reload schema';
