-- Velocidad de Gestión de tienda, segunda tanda (18 nov 2026). El riesgo y los pedidos de cada cliente (Pedidos de tienda, Confirmación, Logística) se
-- calculaban con su historial pedido de a 150 teléfonos por consulta: unas 50 consultas en Confirmación y Logística (60 días de todas las tiendas).
-- `ven_historial_clientes` lo devuelve de una vez: por cada teléfono normalizado, cuántos pedidos tiene y cuántos terminaron entregados, devueltos o
-- cancelados (cancelado incluye no gestionado, como la regla de antes). `unidades`: las tiendas que la persona puede ver (null = todas).
-- La usa `historialDeClientes` (src/lib/tienda/datos-finanzas.ts); sin esta migración sigue la forma anterior. Solo el servidor (service role).
-- Se puede correr más de una vez. Reversa: supabase/rollbacks/0322_rollback.sql

create or replace function ven_historial_clientes(claves text[], unidades uuid[] default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(x.clave, jsonb_build_object('total', x.total, 'entregadas', x.entregadas, 'devueltas', x.devueltas, 'canceladas', x.canceladas)), '{}'::jsonb)
  from (
    select c.telefono_clave as clave,
      count(*) as total,
      count(*) filter (where o.estado_entrega = 'entregada') as entregadas,
      count(*) filter (where o.estado_entrega = 'devuelta') as devueltas,
      count(*) filter (where o.estado_entrega in ('cancelada', 'no_gestionada')) as canceladas
    from ven_ordenes_clientes c
    join ven_ordenes o on o.id = c.orden_id
    where c.telefono_clave = any(claves)
      and (unidades is null or o.unidad_id = any(unidades))
    group by c.telefono_clave
  ) x;
$$;
revoke all on function ven_historial_clientes(text[], uuid[]) from public, anon, authenticated;
notify pgrst, 'reload schema';

-- Revisión: debe decir «sí».
select case when exists (select 1 from pg_proc where proname = 'ven_historial_clientes') then 'sí' else 'NO' end as funcion_historial;
