-- Gestión de IDs Dropi: ninguna publicación se elimina (regla de Hernán, 23 oct 2026: ni en Dropi ni en el sistema, todo se archiva).
-- La pantalla ya solo archiva (`archivarPublicacion`); este disparador lo asegura en la base: cualquier DELETE sobre
-- `dropi_publicaciones` (desde la app, un script o el editor SQL) falla con un mensaje claro. Para archivar: estado = 'archivado'.
-- De paso se quita `dropi_conexiones` (migración 0138, «Conectar Dropi»), que quedó vacía y sin uso: Dropi rechaza las llamadas del
-- servidor y los cambios se aplican con el favorito «Aplicar en Dropi».
-- Reversa: supabase/rollbacks/0140_rollback.sql

create or replace function dropi_publicaciones_no_borrar() returns trigger
language plpgsql as $$
begin
  raise exception 'Las publicaciones de Dropi no se eliminan: archívala (estado = ''archivado'').'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists dropi_publicaciones_no_borrar on dropi_publicaciones;
create trigger dropi_publicaciones_no_borrar
  before delete on dropi_publicaciones
  for each row execute function dropi_publicaciones_no_borrar();

drop table if exists dropi_conexiones;
