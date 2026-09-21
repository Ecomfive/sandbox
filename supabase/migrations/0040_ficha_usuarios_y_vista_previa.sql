-- Ficha de usuario más completa (checklist de alta, recordatorio de foto) y datos para "Ver así"
-- (probar la app con los permisos de un rol sin cerrar sesión). "Ver así" no necesita tabla: es
-- una cookie en el navegador de quien la usa (ver src/lib/auth.ts), nunca cambia lo que ve nadie
-- más ni queda guardado en la base.

alter table perfiles add column if not exists primer_ingreso_en timestamptz;
alter table perfiles add column if not exists foto_recordada_en timestamptz;
alter table roles add column if not exists descripcion text;

-- Se marca solo, la primera vez que la persona entra de verdad (auth.users.last_sign_in_at pasa
-- de null a una fecha). No se vuelve a tocar en los ingresos siguientes.
create or replace function marcar_primer_ingreso() returns trigger as $$
begin
  if old.last_sign_in_at is null and new.last_sign_in_at is not null then
    update perfiles set primer_ingreso_en = new.last_sign_in_at
    where id = new.id and primer_ingreso_en is null;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trigger_marcar_primer_ingreso on auth.users;
create trigger trigger_marcar_primer_ingreso
  after update of last_sign_in_at on auth.users
  for each row execute function marcar_primer_ingreso();
