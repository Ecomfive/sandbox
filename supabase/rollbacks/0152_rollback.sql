-- Reversa de la migración 0152: vuelve a impedir borrar cualquier publicación (migración 0140).
create or replace function dropi_publicaciones_no_borrar() returns trigger
language plpgsql as $$
begin
  raise exception 'Las publicaciones de Dropi no se eliminan: archívala (estado = ''archivado'').'
    using errcode = 'P0001';
end;
$$;
