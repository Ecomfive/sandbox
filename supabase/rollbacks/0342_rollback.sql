-- Reversa de la 0342 (pedir fotos reales en Cuánto hay). Los permisos que dio a Gestión de IDs no se quitan: no se puede saber cuáles tenía ya.
-- Antes, vaciar el almacén «cuanto-hay-fotos» desde Storage si ya tiene fotos.
drop table if exists tienda_cuanto_hay_fotos;
delete from tienda_cuanto_hay where tipo = 'fotos';
alter table tienda_cuanto_hay drop constraint if exists tienda_cuanto_hay_tipo_check;
alter table tienda_cuanto_hay drop column if exists tipo;
alter table tienda_cuanto_hay drop column if exists pais_id;
delete from storage.buckets where id = 'cuanto-hay-fotos';
notify pgrst, 'reload schema';
