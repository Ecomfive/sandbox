-- Reversa de la migración 0106: quita la fuente Instagram (tabla, permiso y bucket). Borra los videos guardados.
delete from permisos_rol where modulo = 'instagram';
drop table if exists instagram_capturas;
drop sequence if exists instagram_capturas_numero_seq;
delete from storage.objects where bucket_id = 'instagram-fuentes';
delete from storage.buckets where id = 'instagram-fuentes';
