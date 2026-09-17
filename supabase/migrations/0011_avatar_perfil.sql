-- Foto de perfil por usuario, guardada en un bucket publico de Storage.
-- La subida real la hace un Server Action con la service role, asi que las
-- policies de abajo son para lectura publica y para el caso de que en el
-- futuro se suba directo desde el navegador con la sesion del usuario.

alter table perfiles add column avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar publico de lectura" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "cada quien sube su propio avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cada quien actualiza su propio avatar" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cada quien borra su propio avatar" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
