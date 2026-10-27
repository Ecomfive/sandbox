-- Reversa de la migración 0159: vuelve a dejar borrar solo los borradores sin ID de Dropi (migración 0152).
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
