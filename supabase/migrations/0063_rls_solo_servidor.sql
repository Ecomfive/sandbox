-- Seguridad: la base de datos solo se usa desde el servidor.
--
-- La app lee y escribe siempre con la clave de servicio (service role), que se salta RLS, y comprueba el módulo y el rol
-- de cada persona en el servidor. Las 44 políticas «authenticated read/write» daban además lectura y escritura completas
-- a cualquier usuario con sesión que llamara directo a la API de Supabase con la clave pública: podía leerlo todo,
-- borrar filas y hasta editar su propio perfil para subirse a Admin. Con esta migración esas tablas quedan con RLS
-- activado y sin políticas: solo el servidor puede tocarlas.
--
-- Reversa: supabase/rollbacks/0063_rollback.sql
--
-- ANTES de correrla en producción (ver SEGURIDAD.md): cerrar el registro de cuentas y probar la rama de arreglos en
-- una vista previa, porque el código no debe necesitar acceso directo de los usuarios a las tablas.

do $$
declare
  p record;
  t record;
begin
  -- 1) Quita toda política de `public` cuya condición sea «cualquier usuario con sesión».
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%authenticated%' or coalesce(with_check, '') like '%authenticated%')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice 'Política eliminada: % en %', p.policyname, p.tablename;
  end loop;

  -- 2) Que ninguna tabla de `public` se quede sin RLS (sin políticas, RLS niega todo menos a la clave de servicio).
  for t in
    select tablename from pg_tables where schemaname = 'public' and not rowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    raise notice 'RLS activado en %', t.tablename;
  end loop;
end $$;

-- 3) Avatares: la foto la sube el servidor con la clave de servicio (src/lib/perfil-actions.ts). Estas políticas solo
--    permitían subir directo desde el navegador, algo que la app no hace. La lectura pública (para ver la foto) se queda.
drop policy if exists "cada quien sube su propio avatar" on storage.objects;
drop policy if exists "cada quien actualiza su propio avatar" on storage.objects;
drop policy if exists "cada quien borra su propio avatar" on storage.objects;

-- 4) Límites de los buckets: tamaño y tipos de archivo (antes cualquiera, de cualquier tamaño).
update storage.buckets
set file_size_limit = 2097152, -- 2 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'avatars';

update storage.buckets
set file_size_limit = 52428800, -- 50 MB (imágenes y videos del producto)
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime']
where id = 'wms-productos';

update storage.buckets
set file_size_limit = 26214400 -- 25 MB; sin límite de tipo porque los extractos y comprobantes llegan como CSV, Excel, PDF o imagen
where id in ('extractos-bancarios', 'comprobantes-retiro');
