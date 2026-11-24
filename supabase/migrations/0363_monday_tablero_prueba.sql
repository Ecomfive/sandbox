-- Tablero de prueba del panel del repartidor (24 nov 2026, pedido de Hernán: «queremos modificar cosas para probarlas y no hacerlo con los pedidos
-- reales»). El tablero «USUARIO DE PRUEBA» de Monday (18441424577, espacio Panamá) se lee como los de los repartidores, pero marcado `prueba`: sus filas
-- quedan con el repartidor «USUARIO DE PRUEBA», sin tienda ni pedido enlazado (lo que se marque no cambia ningún pedido, no sale en Logística ni en las
-- métricas de Monday). La cuenta de prueba que estaba unida a JULY CALLE pasa a ese repartidor. Monday no se toca: solo se lee.
-- Se puede correr de nuevo. Reversa: supabase/rollbacks/0363_rollback.sql
alter table mon_tableros_extra add column if not exists prueba boolean not null default false;

insert into mon_tableros_extra (tablero_id, nombre, clase, prueba)
values ('18441424577', 'Usuario de prueba', 'despachos', true)
on conflict (tablero_id) do update set nombre = excluded.nombre, clase = 'despachos', prueba = true, activo = true;

update despacho_repartidores set courier = 'USUARIO DE PRUEBA' where id = '01a20f7b-74d5-79cd-9db5-5d23bd0e0d30';

notify pgrst, 'reload schema';

-- Revisión: las dos filas deben decir «sí».
select 'tablero de prueba registrado' as que,
  case when exists (select 1 from mon_tableros_extra where tablero_id = '18441424577' and prueba and activo) then 'sí' else 'NO' end as quedo
union all
select 'la cuenta de prueba usa el repartidor de prueba',
  case when exists (select 1 from despacho_repartidores where id = '01a20f7b-74d5-79cd-9db5-5d23bd0e0d30' and courier = 'USUARIO DE PRUEBA') then 'sí' else 'NO' end;
