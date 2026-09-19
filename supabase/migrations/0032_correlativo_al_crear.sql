-- El correlativo del retiro se asigna al CREAR el retiro, no al abrir la ventana.
-- Antes, abrir la ficha consumia un numero de la secuencia aunque despues no se
-- guardara, y cada apertura dejaba un hueco. Ahora la ficha solo MUESTRA cual
-- seria el siguiente (el mayor existente + 1) sin gastarlo: mientras no se cree un
-- retiro, abrir la ficha muestra siempre el mismo numero.

-- 1) Siguiente correlativo, sin consumir nada.
create or replace function siguiente_correlativo_retiro() returns bigint
language sql
stable
set search_path = ''
as $$ select coalesce(max(numero_correlativo), 0) + 1 from public.retiros $$;

-- Solo el service role (server actions) puede consultarlo.
revoke execute on function siguiente_correlativo_retiro() from public, anon, authenticated;
grant execute on function siguiente_correlativo_retiro() to service_role;

-- 2) Un retiro guardado sin numero explicito toma el siguiente, en vez de gastar
--    un numero de la secuencia.
alter table retiros alter column numero_correlativo set default public.siguiente_correlativo_retiro();

-- 3) Ya no hace falta apartar numeros: se retiran la funcion y la secuencia viejas.
drop function if exists reservar_correlativo_retiro();
drop sequence if exists retiros_correlativo_seq;
