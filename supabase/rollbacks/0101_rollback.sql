-- Reversa de la migración 0101: quita el estado «Inactivo» de los productos. Los productos que estuvieran inactivos vuelven
-- a Activo ('fisico') antes de cerrar el `check`, porque si no la restricción no se podría crear.

update skus_maestros set clase = 'fisico' where clase = 'inactivo';

alter table skus_maestros drop constraint if exists skus_maestros_clase_check;
alter table skus_maestros
  add constraint skus_maestros_clase_check check (clase in ('fisico', 'test'));
