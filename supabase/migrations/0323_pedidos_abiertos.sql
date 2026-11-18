-- Velocidad de Logística y Confirmación de tienda (18 nov 2026, tercera tanda; Hernán: «Sí, sigue»). Medido el 18 nov: Logística 5,6 s y Confirmación 3,9 s.
-- Las dos traían 60 días de pedidos de todas las tiendas (9.146 el 18 nov) para usar una parte: Logística los de Shopify no cancelados (~3.900) y
-- Confirmación los de Shopify sin confirmar o confirmados (~140).
-- `ven_pedidos_periodo` y `ven_lineas_periodo` (migración 0321) reciben dos filtros opcionales:
--   `solo_shopify`: solo los pedidos con la hora de Shopify (`creado_origen`; los del Excel no la tienen);
--   `excluir`: los `estado_entrega` que no se quieren (entregada, cancelada…; los pendientes, sin estado, siempre van).
-- Sin los filtros responden igual que antes (los llamados de 3 datos siguen andando). Los usa `pedidosDeTiendas` (src/lib/tienda/datos-finanzas.ts) con
-- la opción `abiertos`; sin esta migración, trae todo y filtra en el servidor (como antes).
-- Solo el servidor (service role) puede llamarlas. Se puede correr más de una vez. Reversa: supabase/rollbacks/0323_rollback.sql

drop function if exists ven_pedidos_periodo(uuid[], date, date);
drop function if exists ven_lineas_periodo(uuid[], date, date);

create or replace function ven_pedidos_periodo(unidades uuid[], desde date, hasta date, solo_shopify boolean default false, excluir text[] default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'unidad_id', o.unidad_id, 'numero', o.numero, 'fecha', o.fecha, 'estado_entrega', o.estado_entrega, 'etiquetas', o.etiquetas,
    'total', o.total, 'moneda', o.moneda, 'transportista', o.transportista, 'guia', o.guia, 'origen', o.origen, 'creado_origen', o.creado_origen,
    'forma_pago_entrega', o.forma_pago_entrega, 'despachada_en', o.despachada_en,
    'ven_ordenes_clientes', case when c.orden_id is null then null else jsonb_build_object(
      'nombre', c.nombre, 'corregimiento', c.corregimiento, 'direccion', c.direccion, 'telefono', c.telefono, 'telefono_clave', c.telefono_clave, 'notas', c.notas) end
  ) order by o.fecha desc, o.id), '[]'::jsonb)
  from ven_ordenes o
  left join ven_ordenes_clientes c on c.orden_id = o.id
  where o.unidad_id = any(unidades) and o.fecha between desde and hasta
    and (not coalesce(solo_shopify, false) or o.creado_origen is not null)
    and (excluir is null or o.estado_entrega is null or o.estado_entrega <> all(excluir));
$$;

create or replace function ven_lineas_periodo(unidades uuid[], desde date, hasta date, solo_shopify boolean default false, excluir text[] default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'orden_id', l.orden_id, 'linea', l.linea, 'producto', l.producto, 'cantidad', l.cantidad, 'precio', l.precio, 'sku', l.sku,
    'sku_maestro_id', l.sku_maestro_id, 'es_servicio', l.es_servicio
  ) order by l.orden_id, l.linea), '[]'::jsonb)
  from ven_orden_lineas l
  join ven_ordenes o on o.id = l.orden_id
  where o.unidad_id = any(unidades) and o.fecha between desde and hasta
    and (not coalesce(solo_shopify, false) or o.creado_origen is not null)
    and (excluir is null or o.estado_entrega is null or o.estado_entrega <> all(excluir));
$$;

revoke all on function ven_pedidos_periodo(uuid[], date, date, boolean, text[]) from public, anon, authenticated;
revoke all on function ven_lineas_periodo(uuid[], date, date, boolean, text[]) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Revisión: las dos deben decir «sí» (cada función con los 5 datos y una sola versión).
select
  case when (select count(*) from pg_proc where proname = 'ven_pedidos_periodo') = 1
        and exists (select 1 from pg_proc where proname = 'ven_pedidos_periodo' and pronargs = 5) then 'sí' else 'NO' end as funcion_pedidos,
  case when (select count(*) from pg_proc where proname = 'ven_lineas_periodo') = 1
        and exists (select 1 from pg_proc where proname = 'ven_lineas_periodo' and pronargs = 5) then 'sí' else 'NO' end as funcion_lineas;
