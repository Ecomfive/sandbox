-- CRM › Dirección, fase 3 (30 oct 2026, pedido de Hernán: vender más). Qué productos vende cada dropshipper:
--  * `crm_ordenes_items.producto_id`: el ID del producto de Dropi de cada línea del pedido (viene en el pedido de Dropi como `product_id`; hasta
--    ahora solo se guardaba el nombre, que cambia cuando se renombra el producto). `crm_sincronizar_ordenes` lo guarda desde ahora y, al final de
--    esta migración, se corre una vez para completarlo en los pedidos que ya estaban (todos siguen en `staging_ordenes_dropi`).
--  * `crm_productos_por_dropshipper(p_pais, p_dias)`: por dropshipper y producto, los pedidos de los últimos `p_dias` días (sin cancelados).
-- Con eso el panel cruza el stock y lo que viene en camino de cada producto (Compras) con quién lo vende. RLS sin cambios (migración 0063).
-- Reversa: supabase/rollbacks/0200_rollback.sql

alter table crm_ordenes_items add column if not exists producto_id bigint;
create index if not exists crm_ordenes_items_producto on crm_ordenes_items (producto_id);

-- Igual que en la migración 0065, más `producto_id` en las líneas.
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
  on conflict (orden_id, linea) do update set producto = excluded.producto, sku = excluded.sku, precio = excluded.precio, producto_id = excluded.producto_id;

  return tocados;
end;
$$;

create or replace function crm_productos_por_dropshipper(p_pais uuid, p_dias integer default 30)
returns table (dropshipper_id uuid, producto_id bigint, producto text, pedidos integer)
language sql stable as $$
  select c.dropshipper_id, i.producto_id, max(i.producto), count(distinct o.id)::integer
  from crm_ordenes o
  join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
  join crm_ordenes_items i on i.orden_id = o.id
  where o.pais_id = p_pais
    and i.producto_id is not null
    and crm_estado_grupo(o.estado) <> 'cancelado'
    and o.fecha >= (now() at time zone 'America/Panama') - greatest(1, least(p_dias, 180)) * interval '1 day'
  group by c.dropshipper_id, i.producto_id
$$;

-- Completa `producto_id` en los pedidos que ya estaban.
select crm_sincronizar_ordenes();
