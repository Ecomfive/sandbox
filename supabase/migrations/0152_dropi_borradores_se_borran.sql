-- Gestión de IDs Dropi › los borradores sí se eliminan (pedido de Jhokser, 24 oct 2026). La migración 0140 impedía borrar cualquier publicación
-- (regla de Hernán: todo se archiva). Una publicación «Sin publicar» (`estado_publicacion = 'borrador'`) que nunca existió en Dropi (sin
-- `dropi_id`) no tiene historia que cuidar: ahora esa se puede eliminar para siempre desde su ficha (`eliminarBorrador`). Cualquier otra sigue
-- sin poder borrarse. Sus comentarios, decisiones, IA y cambios pendientes se van con ella (todas sus llaves son `on delete cascade`).
-- Reversa: supabase/rollbacks/0152_rollback.sql

create or replace function dropi_publicaciones_no_borrar() returns trigger
language plpgsql as $$
begin
  if old.estado_publicacion = 'borrador' and old.dropi_id is null then
    return old;
  end if;
  raise exception 'Las publicaciones de Dropi no se eliminan: archívala (estado = ''archivado''). Solo se eliminan los borradores sin publicar.'
    using errcode = 'P0001';
end;
$$;
