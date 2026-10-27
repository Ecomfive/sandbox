-- Gestión de IDs Dropi › un administrador elimina una publicación sin ID de Dropi (pedido de Alcides, 27 oct 2026). La 0152 solo
-- dejaba borrar los borradores; una publicación que nunca tuvo ID de Dropi (creada por error, «F») tampoco tiene ventas, stock ni
-- competencia que dependan de ella. Que la elimine solo un administrador lo comprueba el servidor (`eliminarPublicacion`); la base
-- solo se niega a borrar una con ID de Dropi, que sigue archivándose (regla de Hernán). Comentarios, decisiones, IA, fotos y cambios
-- pendientes se van con ella (`on delete cascade`); `duplicada_de` y `nueva_publicacion_id` quedan en null.
-- Reversa: supabase/rollbacks/0159_rollback.sql

create or replace function dropi_publicaciones_no_borrar() returns trigger
language plpgsql as $$
begin
  if nullif(btrim(coalesce(old.dropi_id, '')), '') is null then
    return old;
  end if;
  raise exception 'Las publicaciones con ID de Dropi no se eliminan: archívala (estado = ''archivado''). Solo se eliminan las que no tienen ID de Dropi.'
    using errcode = 'P0001';
end;
$$;
