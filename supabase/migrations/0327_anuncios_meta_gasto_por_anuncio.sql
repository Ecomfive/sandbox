-- Anuncios Meta (18 nov 2026): «Analizar los pendientes» y el cron de videos ahora cuentan TODO el historial leído (al traer un año quedaban cientos de videos viejos sin analizar porque solo se miraban los últimos
-- 30 días). Esta función da lo gastado por anuncio en todo el historial, sumado en la base (una fila por anuncio) en vez de traer decenas de miles de filas por día. Solo la ejecuta el servidor (service_role).
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0327_rollback.sql

create or replace function meta_gasto_por_anuncio(p_cuentas uuid[])
returns table (anuncio_id uuid, gasto numeric)
language sql
stable
as $$
  select r.anuncio_id, sum(r.gasto)::numeric as gasto
  from meta_resultados_dia r
  where r.cuenta_id = any(p_cuentas) and r.gasto > 0
  group by r.anuncio_id
  order by r.anuncio_id
$$;

notify pgrst, 'reload schema';
