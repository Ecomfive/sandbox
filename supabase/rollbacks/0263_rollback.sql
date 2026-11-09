-- Reversa de 0263_dunamixfy.sql: se olvida lo leído de Dunamixfy (productos, vendedores y sus ventas diarias) y el módulo deja de tener permisos.
delete from plataforma_ventas_diarias where plataforma = 'dunamixfy';
alter table plataforma_ventas_diarias drop constraint if exists plataforma_ventas_diarias_plataforma_check;
alter table plataforma_ventas_diarias add constraint plataforma_ventas_diarias_plataforma_check check (plataforma in ('effi', 'drop'));
drop table if exists dunamixfy_vendedores;
drop table if exists dunamixfy_publicaciones;
delete from permisos_rol where modulo = 'publicaciones-dunamixfy';
update plataformas set nombre = 'Dynamic 5' where nombre = 'Dunamixfy';
notify pgrst, 'reload schema';
