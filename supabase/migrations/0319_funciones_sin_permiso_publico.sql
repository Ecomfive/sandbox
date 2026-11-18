-- Funciones de la base sin permiso de ejecución para la clave pública (auditoría de seguridad, 18 nov 2026).
--
-- Postgres deja ejecutar cualquier función nueva a PUBLIC, y Supabase además se la da a `anon` y `authenticated`: con la
-- clave pública (que viaja en el navegador) se podía llamar a /rest/v1/rpc/<función> de las ~90 funciones del esquema
-- public. Las tablas no se leen así (no tienen políticas desde 0063), pero algunas funciones sí hacen algo: avanzan la serie
-- de códigos de barras (wms_generar_codigo_barras), muestran qué migraciones están corridas (fin_estado_migraciones), etc.
-- La app llama a todas las funciones desde el servidor con la clave de servicio (`service_role`), que las sigue pudiendo
-- ejecutar; el navegador solo usa Storage y canales en vivo, que no pasan por estas funciones. Los disparadores (triggers)
-- siguen funcionando: al dispararse no se revisa este permiso.
--
-- También cambia lo que se aplica a las funciones que se creen desde ahora (para el rol postgres, que corre las migraciones).
--
-- Repetible. Reversa: supabase/rollbacks/0319_rollback.sql.

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- Revisión (solo lee): lo esperado es «anon_ejecuta = 0», «con_sesion_ejecuta = 0» y «servicio_no_ejecuta = 0».
select
  count(*) filter (where has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_ejecuta,
  count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')) as con_sesion_ejecuta,
  count(*) filter (where not has_function_privilege('service_role', p.oid, 'EXECUTE')) as servicio_no_ejecuta,
  count(*) as funciones_en_public
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';
