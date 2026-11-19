-- Reversa de 0336: se quitan el permiso de Nicol y las preguntas de Proveeduría (sin tienda), y tienda_id vuelve a ser obligatoria.
delete from permisos_persona pp using perfiles p
where pp.perfil_id = p.id and pp.modulo = 'tienda-cuanto-hay' and p.nombre ilike 'Nicol%';
delete from tienda_cuanto_hay where tienda_id is null;
alter table tienda_cuanto_hay alter column tienda_id set not null;
notify pgrst, 'reload schema';
