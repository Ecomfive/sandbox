-- 0198 · El ID de Dropi de cada producto en el desempeño del dropshipper (30 oct 2026, pedido de Alcides).
--
-- `crm_ordenes_items` solo guardaba el nombre del producto. Ahora guarda también su ID en la plataforma (`producto_id`, el `product_id`
-- de cada línea del pedido de Dropi), `crm_sincronizar_ordenes()` lo llena y `crm_productos_vendidos` devuelve los IDs de cada producto
-- (`ids`, «7820» o «7820, 8701» si el mismo nombre tuvo dos IDs). Al final se corre la sincronización una vez para llenar los pedidos que
-- ya estaban (todos siguen en `staging_ordenes_dropi`). Se puede correr dos veces. Reversa: supabase/rollbacks/0198_rollback.sql.

alter table crm_ordenes_items add column if not exists producto_id bigint;

create or replace function crm_sincronizar_ordenes() returns integer
language plpgsql as $$
declare
  tocados integer;
begin
  create temp table crm_tmp_ult on commit drop as
  select distinct on (c.pais_id, (s.payload ->> 'id')::bigint)
    c.pais_id, c.plataforma_id, (s.payload ->> 'id')::bigint as orden_externa, s.payload
  from staging_ordenes_dropi s
  join cuentas_extraccion c on c.id = s.cuenta_extraccion_id
  where s.payload ->> 'id' ~ '^\d+$' and c.pais_id is not null
  order by c.pais_id, (s.payload ->> 'id')::bigint, s.creado_en desc;

  insert into crm_ordenes (plataforma_id, pais_id, orden_externa, usuario_externo, tienda_externa, tienda_nombre, estado, fecha, total, transportadora)
  select plataforma_id, pais_id, orden_externa,
    payload ->> 'user_id', payload ->> 'shop_id', payload -> 'shop' ->> 'name',
    coalesce(payload ->> 'status', ''), (payload ->> 'created_at')::timestamp,
    coalesce((payload ->> 'total_order')::numeric, 0), payload ->> 'shipping_company'
  from crm_tmp_ult
  where payload ->> 'created_at' is not null
  on conflict (plataforma_id, pais_id, orden_externa) do update set
    usuario_externo = excluded.usuario_externo, tienda_externa = excluded.tienda_externa,
    tienda_nombre = excluded.tienda_nombre, estado = excluded.estado, fecha = excluded.fecha,
    total = excluded.total, transportadora = excluded.transportadora, actualizado_en = now();
  get diagnostics tocados = row_count;

  insert into crm_ordenes_items (orden_id, linea, producto, sku, precio, producto_id)
  select o.id, d.linea::integer, d.item -> 'product' ->> 'name', d.item -> 'product' ->> 'sku',
    (d.item -> 'product' ->> 'sale_price')::numeric,
    case
      when d.item ->> 'product_id' ~ '^\d{1,15}$' then (d.item ->> 'product_id')::bigint
      when d.item -> 'product' ->> 'id' ~ '^\d{1,15}$' then (d.item -> 'product' ->> 'id')::bigint
    end
  from crm_tmp_ult u
  join crm_ordenes o on o.plataforma_id = u.plataforma_id and o.pais_id = u.pais_id and o.orden_externa = u.orden_externa
  cross join lateral jsonb_array_elements(coalesce(u.payload -> 'orderdetails', '[]'::jsonb)) with ordinality as d(item, linea)
  on conflict (orden_id, linea) do update set producto = excluded.producto, sku = excluded.sku, precio = excluded.precio,
    producto_id = excluded.producto_id;

  return tocados;
end;
$$;

-- Cambia lo que devuelve (se suma `ids`): hay que borrarla antes de volver a crearla.
drop function if exists crm_productos_vendidos(uuid, date, date);
create function crm_productos_vendidos(p_dropshipper uuid, p_desde date, p_hasta date)
returns table (producto text, sku text, unidades bigint, entregadas bigint, ids text)
language sql stable as $$
  select coalesce(i.producto, '(sin nombre)'), max(i.sku), count(*),
    count(*) filter (where crm_estado_grupo(o.estado) = 'entregado'),
    string_agg(distinct i.producto_id::text, ', ' order by i.producto_id::text)
  from crm_ordenes o
  join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
  join crm_ordenes_items i on i.orden_id = o.id
  where c.dropshipper_id = p_dropshipper and o.fecha::date between p_desde and p_hasta
    and crm_estado_grupo(o.estado) <> 'cancelado'
  group by coalesce(i.producto, '(sin nombre)')
  order by count(*) desc
  limit 20
$$;

-- Los pedidos que ya estaban: la sincronización vuelve a escribir sus líneas, ahora con el ID.
select crm_sincronizar_ordenes();
