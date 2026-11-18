-- Reversa de 0315: vuelve a crear las políticas de lectura de los buckets públicos (con ellas el bucket se puede listar).
drop policy if exists "avatar publico de lectura" on storage.objects;
create policy "avatar publico de lectura" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "wms productos publico de lectura" on storage.objects;
create policy "wms productos publico de lectura" on storage.objects for select using (bucket_id = 'wms-productos');
