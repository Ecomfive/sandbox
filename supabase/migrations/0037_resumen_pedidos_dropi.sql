-- Resumen de Pedidos Dropi calculado en la base. Antes, la pagina traia TODAS las
-- ordenes del periodo (y toda la cartera de ganancias) a JavaScript solo para
-- contarlas, sumar montos, agrupar por estado y detectar «liquidado sin marcar
-- entregado». Ahora la base devuelve un renglon por estado y la lista de alertas.
--
-- Si esta migracion todavia no se corrio, la pagina sigue funcionando: cae al
-- calculo en JavaScript de antes (mas lento). Correrla en el editor SQL de Supabase.

-- La busqueda «esta orden ya tiene ganancia en la cartera?» cruza por referencia.
create index if not exists historial_cartera_referencia_idx
  on historial_cartera (pais_id, plataforma_id, orden_referencia_externa);

-- Un renglon por estado: cuantas ordenes, cuanto suman y cuantas son alerta
-- (Dropi ya registro la ganancia en la cartera pero el pedido no figura ENTREGADO).
create or replace function pedidos_dropi_resumen(
  p_pais uuid,
  p_plataforma uuid,
  p_desde date,
  p_hasta date
) returns table (estado text, cantidad bigint, monto numeric, alertas bigint)
language sql
stable
set search_path = ''
as $$
  select
    o.estado,
    count(*)::bigint,
    coalesce(sum(o.monto), 0),
    (count(*) filter (
      where o.estado not ilike '%entregad%'
        and exists (
          select 1
          from public.historial_cartera c
          where c.pais_id = o.pais_id
            and c.plataforma_id = o.plataforma_id
            and c.orden_referencia_externa = o.referencia_externa
            and c.descripcion ilike '%ganancia%'
        )
    ))::bigint
  from public.ordenes o
  where o.pais_id = p_pais
    and o.plataforma_id = p_plataforma
    and o.fecha between p_desde and p_hasta
  group by o.estado
$$;

-- Las ordenes en alerta del periodo (referencia y estado), las mas recientes primero.
-- Tope de 5000: son excepciones, no el grueso de las ordenes.
create or replace function pedidos_dropi_alertas(
  p_pais uuid,
  p_plataforma uuid,
  p_desde date,
  p_hasta date
) returns table (referencia_externa text, estado text)
language sql
stable
set search_path = ''
as $$
  select o.referencia_externa, o.estado
  from public.ordenes o
  where o.pais_id = p_pais
    and o.plataforma_id = p_plataforma
    and o.fecha between p_desde and p_hasta
    and o.estado not ilike '%entregad%'
    and exists (
      select 1
      from public.historial_cartera c
      where c.pais_id = o.pais_id
        and c.plataforma_id = o.plataforma_id
        and c.orden_referencia_externa = o.referencia_externa
        and c.descripcion ilike '%ganancia%'
    )
  order by o.fecha desc, o.referencia_externa
  limit 5000
$$;

-- Solo el service role (la pagina del servidor) puede llamarlas.
revoke execute on function pedidos_dropi_resumen(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function pedidos_dropi_resumen(uuid, uuid, date, date) to service_role;
revoke execute on function pedidos_dropi_alertas(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function pedidos_dropi_alertas(uuid, uuid, date, date) to service_role;
