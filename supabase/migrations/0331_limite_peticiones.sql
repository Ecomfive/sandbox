-- 0331 · Límite de peticiones y avisos de seguridad (seguridad · 19 nov 2026).
--
-- Antes nada frenaba a quien probara claves en el login, ni a quien llamara sin parar al asistente con IA (cada pregunta cuesta) o al
-- enlace del mensajero. Ahora el servidor cuenta las peticiones por clave (un correo, una IP, una persona, un enlace) en ventanas fijas
-- de tiempo y, pasado el máximo, las rechaza (`src/lib/seguridad/limite.ts`). Las claves llegan ya resumidas (hash): aquí no se guardan
-- correos ni IP.
--
-- - `limite_contadores`: una fila por clave, largo de ventana e inicio de ventana. Las filas de más de un día se borran solas (en ~1 de
--   cada 100 llamadas): ninguna ventana dura más de un día.
-- - `limite_sumar(clave, ventana, sumar)`: suma (sin carreras: insert … on conflict … returning) y devuelve cuántas van en la ventana
--   actual; con `sumar = 0` solo mira, y con un número negativo devuelve (sin bajar de 0): el login suma antes de probar la clave
--   (sin carreras entre peticiones a la vez) y la devuelve si era correcta.
-- - `limite_peticiones(clave, ventana, maximo)`: suma 1 y dice si todavía está dentro del máximo.
-- - `limite_reiniciar(clave)`: borra la cuenta de una clave (un ingreso correcto limpia los fallos de ese correo).
-- - Avisos: `notificaciones_usuario` acepta el tipo «seguridad» (los avisos a quien puede modificar Usuarios y roles).
--
-- RLS activado y sin políticas; las funciones solo las ejecuta `service_role`. Sin esta migración la app deja pasar todo, como antes
-- (nunca deja a nadie afuera por una falla de la base), y los avisos salen como tipo «mención».
--
-- Se puede correr dos veces. Reversa: supabase/rollbacks/0331_rollback.sql

create table if not exists public.limite_contadores (
  clave text not null check (char_length(clave) between 1 and 200),
  ventana integer not null check (ventana between 1 and 86400),
  inicio timestamptz not null,
  cuenta integer not null default 0,
  primary key (clave, ventana, inicio)
);
-- Para borrar lo viejo sin recorrer toda la tabla.
create index if not exists limite_contadores_inicio on public.limite_contadores (inicio);
alter table public.limite_contadores enable row level security;
revoke all on table public.limite_contadores from public, anon, authenticated;
comment on table public.limite_contadores is 'Cuántas peticiones lleva cada clave (resumida) en su ventana de tiempo. Solo servidor (0331).';

create or replace function public.limite_sumar(p_clave text, p_ventana_segundos integer, p_sumar integer default 1) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_inicio timestamptz;
  v_cuenta integer;
begin
  if p_clave is null or char_length(p_clave) not between 1 and 200 then
    raise exception 'Clave no válida.';
  end if;
  if p_ventana_segundos is null or p_ventana_segundos not between 1 and 86400 then
    raise exception 'Ventana no válida.';
  end if;
  if p_sumar is null or p_sumar not between -1000 and 1000 then
    raise exception 'Suma no válida.';
  end if;
  -- Ventana fija: empieza en el múltiplo de su largo (mismo cálculo que `inicioDeVentana` en limite-reglas.ts).
  v_inicio := to_timestamp((floor(extract(epoch from now()) / p_ventana_segundos) * p_ventana_segundos)::double precision);
  if p_sumar = 0 then
    select c.cuenta into v_cuenta from public.limite_contadores c
    where c.clave = p_clave and c.ventana = p_ventana_segundos and c.inicio = v_inicio;
    return coalesce(v_cuenta, 0);
  end if;
  -- Devolver (un ingreso correcto no gasta el cupo): resta sin bajar de 0; sin fila no hay nada que devolver.
  if p_sumar < 0 then
    update public.limite_contadores as c set cuenta = greatest(c.cuenta + p_sumar, 0)
    where c.clave = p_clave and c.ventana = p_ventana_segundos and c.inicio = v_inicio
    returning c.cuenta into v_cuenta;
    return coalesce(v_cuenta, 0);
  end if;
  insert into public.limite_contadores as c (clave, ventana, inicio, cuenta)
  values (p_clave, p_ventana_segundos, v_inicio, p_sumar)
  on conflict (clave, ventana, inicio) do update set cuenta = c.cuenta + excluded.cuenta
  returning c.cuenta into v_cuenta;
  -- Limpieza de paso: ninguna ventana dura más de un día.
  if random() < 0.01 then
    delete from public.limite_contadores where inicio < now() - interval '1 day';
  end if;
  return v_cuenta;
end;
$$;

create or replace function public.limite_peticiones(p_clave text, p_ventana_segundos integer, p_maximo integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_maximo is null or p_maximo < 1 then
    raise exception 'Máximo no válido.';
  end if;
  return public.limite_sumar(p_clave, p_ventana_segundos, 1) <= p_maximo;
end;
$$;

create or replace function public.limite_reiniciar(p_clave text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.limite_contadores where clave = p_clave;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.limite_sumar(text, integer, integer) from public, anon, authenticated;
revoke all on function public.limite_peticiones(text, integer, integer) from public, anon, authenticated;
revoke all on function public.limite_reiniciar(text) from public, anon, authenticated;
grant execute on function public.limite_sumar(text, integer, integer) to service_role;
grant execute on function public.limite_peticiones(text, integer, integer) to service_role;
grant execute on function public.limite_reiniciar(text) to service_role;

-- El tipo «seguridad» en los avisos personales. Se conserva todo lo que ya aceptaba la regla (sea cual sea la última migración que la
-- dejó) y se suman los tipos que usa el código hoy.
do $$
declare
  r record;
  m text[];
  v text;
  valores text[] := array['mencion', 'proveedor', 'tarea', 'sin_stock', 'whatsapp', 'remision', 'cierre', 'llegada', 'adelanto', 'seguridad'];
begin
  for r in
    select c.conname, pg_get_constraintdef(c.oid) as def from pg_constraint c
    where c.conrelid = 'public.notificaciones_usuario'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%tipo%'
  loop
    -- La regla viene como `tipo in ('a', 'b')` (migraciones viejas) o, tras correr esta, como `'{a,b}'::text[]`: el arreglo se abre en
    -- sus valores (si no, una segunda corrida sumaría «{a,b}» como un tipo más).
    for m in select regexp_matches(r.def, '''([^'']+)''', 'g') loop
      foreach v in array (case when left(m[1], 1) = '{' then string_to_array(btrim(m[1], '{}'), ',') else array[m[1]] end) loop
        v := btrim(v, ' "');
        if v <> '' and not (v = any (valores)) then
          valores := valores || v;
        end if;
      end loop;
    end loop;
    execute format('alter table public.notificaciones_usuario drop constraint %I', r.conname);
  end loop;
  execute format('alter table public.notificaciones_usuario add constraint notificaciones_usuario_tipo_check check (tipo = any (%L::text[])) not valid', valores);
end $$;

notify pgrst, 'reload schema';

-- Revisión (solo lee): lo esperado es «tabla_creada = true», «rls_activo = true», «politicas = 0», «funciones_creadas = 3»,
-- «anon_las_ejecuta = 0», «servicio_las_ejecuta = 3», «aviso_seguridad_permitido = true» y
-- «sin_tipos_basura = true» (al correrla dos veces no se suma un tipo «{…}»).
select
  to_regclass('public.limite_contadores') is not null as tabla_creada,
  coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.limite_contadores')), false) as rls_activo,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'limite_contadores') as politicas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('limite_sumar', 'limite_peticiones', 'limite_reiniciar')) as funciones_creadas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('limite_sumar', 'limite_peticiones', 'limite_reiniciar')
      and has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_las_ejecuta,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('limite_sumar', 'limite_peticiones', 'limite_reiniciar')
      and has_function_privilege('service_role', p.oid, 'EXECUTE')) as servicio_las_ejecuta,
  exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.notificaciones_usuario'::regclass and c.conname = 'notificaciones_usuario_tipo_check'
      and pg_get_constraintdef(c.oid) like '%seguridad%'
  ) as aviso_seguridad_permitido,
  not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.notificaciones_usuario'::regclass and c.conname = 'notificaciones_usuario_tipo_check'
      and pg_get_constraintdef(c.oid) like '%"{%'
  ) as sin_tipos_basura;
