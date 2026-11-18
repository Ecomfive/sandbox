-- Velocidad de Gestión de tienda (18 nov 2026, pedido de Hernán: «lo que es gestión de tienda está tardando»). Medido el 18 nov: «Todas las tiendas» tardaba
-- 7,4 s y el Dashboard 8,6 s. Casi todo el tiempo eran idas y vueltas a la base: los pedidos del periodo se pedían de a 1.000 y sus líneas cruzándolas con
-- los pedidos, página por página (decenas de consultas por página).
-- 1) Índice de pedidos por tienda y fecha (así se buscan; solo había por mes: `ven_ordenes_periodo`).
-- 2) `ven_pedidos_periodo` y `ven_lineas_periodo`: los pedidos (con su cliente) y las líneas de esas tiendas entre dos días, cada uno en UNA respuesta (un
--    jsonb; sin el tope de 1.000 filas). Las usa `cargarPedidosFinanzas` (src/lib/tienda/datos-finanzas.ts); sin esta migración sigue la forma anterior.
-- Solo el servidor (service role) puede llamarlas. Se puede correr más de una vez. Reversa: supabase/rollbacks/0321_rollback.sql

create index if not exists ven_ordenes_unidad_fecha on ven_ordenes (unidad_id, fecha desc, id);

create or replace function ven_pedidos_periodo(unidades uuid[], desde date, hasta date) returns jsonb
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
  where o.unidad_id = any(unidades) and o.fecha between desde and hasta;
$$;

create or replace function ven_lineas_periodo(unidades uuid[], desde date, hasta date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'orden_id', l.orden_id, 'linea', l.linea, 'producto', l.producto, 'cantidad', l.cantidad, 'precio', l.precio, 'sku', l.sku,
    'sku_maestro_id', l.sku_maestro_id, 'es_servicio', l.es_servicio
  ) order by l.orden_id, l.linea), '[]'::jsonb)
  from ven_orden_lineas l
  join ven_ordenes o on o.id = l.orden_id
  where o.unidad_id = any(unidades) and o.fecha between desde and hasta;
$$;

revoke all on function ven_pedidos_periodo(uuid[], date, date) from public, anon, authenticated;
revoke all on function ven_lineas_periodo(uuid[], date, date) from public, anon, authenticated;

analyze ven_ordenes;
notify pgrst, 'reload schema';

-- Revisión: las tres deben decir «sí».
select
  case when exists (select 1 from pg_indexes where indexname = 'ven_ordenes_unidad_fecha') then 'sí' else 'NO' end as indice,
  case when exists (select 1 from pg_proc where proname = 'ven_pedidos_periodo') then 'sí' else 'NO' end as funcion_pedidos,
  case when exists (select 1 from pg_proc where proname = 'ven_lineas_periodo') then 'sí' else 'NO' end as funcion_lineas;
