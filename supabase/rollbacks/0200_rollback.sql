-- Reversa de 0200_crm_productos_por_dropshipper.sql: vuelve `crm_sincronizar_ordenes` a la de la migración 0065 y quita `producto_id`.
drop function if exists crm_productos_por_dropshipper(uuid, integer);

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

  insert into crm_ordenes_items (orden_id, linea, producto, sku, precio)
  select o.id, d.linea::integer, d.item -> 'product' ->> 'name', d.item -> 'product' ->> 'sku',
    (d.item -> 'product' ->> 'sale_price')::numeric
  from crm_tmp_ult u
  join crm_ordenes o on o.plataforma_id = u.plataforma_id and o.pais_id = u.pais_id and o.orden_externa = u.orden_externa
  cross join lateral jsonb_array_elements(coalesce(u.payload -> 'orderdetails', '[]'::jsonb)) with ordinality as d(item, linea)
  on conflict (orden_id, linea) do update set producto = excluded.producto, sku = excluded.sku, precio = excluded.precio;

  return tocados;
end;
$$;

drop index if exists crm_ordenes_items_producto;
alter table crm_ordenes_items drop column if exists producto_id;
