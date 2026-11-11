-- Portal AF4 360°: integración de los lotes de la fase CFO en línea.
--
-- 1. `fin_plan_mezcla_productos(dias)`: la mezcla de productos de cada tienda en los últimos N días, para pasar el
--    pronóstico de pedidos por tienda de Planificación (`src/lib/finanzas/pronostico.ts`) a unidades por producto en el
--    Plan de compras (`src/lib/finanzas/demanda-plan.ts`). Por tienda y producto: las unidades entregadas (con la misma
--    forma de encontrar el producto que `fin_inventario_vendido`, 0134) y los pedidos no cancelados de la tienda en la
--    misma ventana (`pedidos`, repetido en cada fila de la tienda). Unidades ÷ pedidos = unidades de ese producto por
--    pedido pronosticado (ya incluye la tasa de entrega, igual que el pronóstico cuenta pedidos no cancelados).
-- 2. `fin_estado_migraciones(pruebas)`: Estado del sistema pregunta al catálogo de Postgres si cada migración se corrió
--    (su tabla o vista, una columna, una función, un tipo en un `check` o un permiso). Solo lee el catálogo y
--    `permisos_rol`; los nombres llegan como valores, nunca se arma SQL con ellos.
--
-- Las funciones solo las llama el servidor. Se puede correr dos veces.

create or replace function fin_plan_mezcla_productos(p_dias integer default 90)
returns table (unidad_id uuid, sku_maestro_id uuid, unidades numeric, pedidos bigint)
language sql stable
set search_path = public
as $$
  with hoy as (select (now() at time zone 'America/Panama')::date as d),
  lineas as (
    select
      o.unidad_id,
      coalesce(l.sku_maestro_id, cm.sku_maestro_id, cd.sku_maestro_id) as sku,
      l.cantidad
    from ven_orden_lineas l
    join ven_ordenes o on o.id = l.orden_id
    left join ven_productos_mapeo mp on mp.producto_clave = l.producto_clave
    left join fin_costo_vigente cm on cm.producto_clave = mp.costo_clave
    left join fin_costo_vigente cd on cd.producto_clave = l.producto_clave
    where o.estado_entrega = 'entregada'
      and not l.es_servicio
      and o.unidad_id is not null
      and coalesce(o.fecha_envio, o.fecha) > (select d from hoy) - p_dias
      and coalesce(o.fecha_envio, o.fecha) <= (select d from hoy)
  ),
  por_sku as (
    select unidad_id, sku, sum(cantidad) as unidades
    from lineas
    where sku is not null
    group by 1, 2
  ),
  pedidos as (
    select o.unidad_id, count(*) as pedidos
    from ven_ordenes o
    where o.estado_entrega <> 'cancelada'
      and o.unidad_id is not null
      and o.fecha > (select d from hoy) - p_dias
      and o.fecha <= (select d from hoy)
    group by 1
  )
  select s.unidad_id, s.sku, round(s.unidades, 2), coalesce(p.pedidos, 0)
  from por_sku s
  left join pedidos p on p.unidad_id = s.unidad_id
$$;

create or replace function fin_estado_migraciones(p_pruebas jsonb)
returns table (migracion text, ok boolean)
language plpgsql stable
set search_path = public
as $$
declare
  r jsonb;
  v_ok boolean;
begin
  for r in select * from jsonb_array_elements(coalesce(p_pruebas, '[]'::jsonb)) loop
    v_ok := case r->>'tipo'
      when 'tabla' then to_regclass('public.' || quote_ident(r->>'nombre')) is not null
      when 'vista' then to_regclass('public.' || quote_ident(r->>'nombre')) is not null
      when 'columna' then exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = r->>'nombre' and c.column_name = r->>'extra'
      )
      when 'funcion' then exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = r->>'nombre'
      )
      when 'check' then exists (
        select 1 from pg_constraint c
        where c.conname = r->>'nombre' and position(quote_literal(r->>'extra') in pg_get_constraintdef(c.oid)) > 0
      )
      when 'permiso' then exists (select 1 from permisos_rol pr where pr.modulo = r->>'nombre')
      else null
    end;
    migracion := r->>'migracion';
    ok := v_ok;
    return next;
  end loop;
end;
$$;
