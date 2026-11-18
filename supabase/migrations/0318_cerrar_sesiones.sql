-- 0318 · Cerrar las sesiones de una cuenta (auditoría de seguridad, 18 nov 2026).
--
-- Antes, suspender a alguien en Usuarios y roles (o desactivar una cuenta del portal del proveedor) solo cambiaba `activo`: el sistema ya no
-- le abría páginas, pero su sesión y su token de renovación seguían valiendo. Ahora la app, al suspender o al darle una contraseña temporal,
-- le pone el bloqueo de ingreso de Supabase Auth y llama a esta función, que borra sus sesiones abiertas (los tokens de renovación de esas
-- sesiones se borran en cascada; con la sesión borrada, Supabase rechaza también su token de acceso en la próxima página).
--
-- Solo la clave de servicio (el servidor) puede llamarla. Sin esta migración la suspensión se guarda igual y la app avisa que faltó cerrar
-- las sesiones.
--
-- Reversa: supabase/rollbacks/0318_rollback.sql

create or replace function public.cerrar_sesiones_usuario(p_usuario uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_usuario is null then
    raise exception 'Falta la cuenta.';
  end if;
  delete from auth.sessions where user_id = p_usuario;
  get diagnostics n = row_count;
  -- Los tokens de renovación que hubieran quedado sin sesión (de antes de que Supabase los atara a una).
  delete from auth.refresh_tokens where user_id = p_usuario::text;
  return n;
end;
$$;

revoke all on function public.cerrar_sesiones_usuario(uuid) from public, anon, authenticated;
grant execute on function public.cerrar_sesiones_usuario(uuid) to service_role;

-- Una sola vez: las cuentas que ya estaban suspendidas se quedan sin sus sesiones y con el ingreso bloqueado, como las que se suspendan desde
-- ahora. Al reactivarlas desde Usuarios y roles (o desde el portal del proveedor) la app les quita el bloqueo.
do $$
declare
  ids uuid[];
  del_portal uuid[];
begin
  select coalesce(array_agg(id), '{}') into ids from public.perfiles where activo = false;
  if to_regclass('public.proveedor_usuarios') is not null then
    execute 'select coalesce(array_agg(usuario_id), ''{}'') from public.proveedor_usuarios where activo = false' into del_portal;
    ids := ids || del_portal;
  end if;
  if array_length(ids, 1) is null then
    return;
  end if;
  perform public.cerrar_sesiones_usuario(u) from unnest(ids) as u;
  update auth.users set banned_until = now() + interval '100 years' where id = any (ids) and (banned_until is null or banned_until < now());
  raise notice 'Cuentas suspendidas sin sesiones: %', array_length(ids, 1);
exception when others then
  -- Si este paso falla (permisos sobre auth), la función de arriba ya quedó creada: se avisa y se sigue. Esas cuentas se pueden volver a
  -- suspender desde la app (Reactivar y Suspender) para cerrarles las sesiones.
  raise warning 'No se pudieron cerrar las sesiones de las cuentas ya suspendidas: %', sqlerrm;
end $$;

-- Revisión (solo lee): lo esperado es «funcion_creada = true», «anon_la_ejecuta = false» y «servicio_la_ejecuta = true»;
-- «suspendidas_con_sesion» debería dar 0 (las cuentas suspendidas ya no tienen sesiones abiertas).
select
  to_regprocedure('public.cerrar_sesiones_usuario(uuid)') is not null as funcion_creada,
  has_function_privilege('anon', 'public.cerrar_sesiones_usuario(uuid)', 'EXECUTE') as anon_la_ejecuta,
  has_function_privilege('service_role', 'public.cerrar_sesiones_usuario(uuid)', 'EXECUTE') as servicio_la_ejecuta,
  (select count(*) from auth.sessions s join public.perfiles p on p.id = s.user_id where not p.activo) as suspendidas_con_sesion;
