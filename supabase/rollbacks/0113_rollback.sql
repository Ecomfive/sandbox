-- Reversa de la migración 0113: quita la categoría de los productos y la taxonomía.
drop index if exists skus_maestros_categoria_idx;
alter table skus_maestros drop column if exists categoria_revisar;
alter table skus_maestros drop column if exists categoria_origen;
alter table skus_maestros drop column if exists categoria_id;
drop table if exists categorias_productos;
