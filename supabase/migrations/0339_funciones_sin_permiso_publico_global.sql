-- Funciones sin permiso de ejecución para la clave pública, también las creadas después de la 0319 (20 nov 2026: al correr
-- la 0988 de Alex, su revisión mostró que `anon` y `authenticated` podían ejecutar ven_ventas_diarias).
--
-- La 0319 quitó el permiso a las funciones que había y cambió lo que reciben las nuevas «en el esquema public». Pero
-- Postgres da EXECUTE a PUBLIC en toda función nueva por una regla general (no por esquema), y una regla «in schema» no puede
-- quitar una general: cada función creada después de la 0319 (nuestras 03xx y las 098x del portal) nació ejecutable con la
-- clave pública. No hubo fuga: esas funciones corren con los permisos de quien llama (security invoker) y las tablas no
-- tienen políticas, así que con la clave pública devuelven vacío. Esta migración:
--   1. vuelve a quitar el permiso a todas las funciones del esquema public (y se lo deja a service_role);
--   2. quita la regla general para lo que cree el rol postgres desde ahora, para que no vuelva a pasar.
-- La app llama a las funciones desde el servidor con la clave de servicio; el navegador solo usa Storage y canales en vivo.
-- Repetible. Reversa: supabase/rollbacks/0339_rollback.sql.

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- Revisión (solo lee): lo esperado es anon_ejecuta = 0, con_sesion_ejecuta = 0 y servicio_no_ejecuta = 0.
select
  count(*) filter (where has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_ejecuta,
  count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')) as con_sesion_ejecuta,
  count(*) filter (where not has_function_privilege('service_role', p.oid, 'EXECUTE')) as servicio_no_ejecuta,
  count(*) as funciones_en_public
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';
