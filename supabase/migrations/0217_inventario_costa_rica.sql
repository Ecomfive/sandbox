-- Inventario de Costa Rica (31 oct 2026, pedido de Alcides): la oficina se levanta desde cero con un conteo en el sistema y de
-- ahí sale la mercancía a las bodegas de terceros (Dropi, Effi, Boxfull, Dunamixfy) con remisiones.
--
-- * Bodega «Oficina» (propia) en Costa Rica; «Despacho» y «Fulfillment» de Costa Rica se desactivan si no tienen stock.
-- * Las bolsas de empaque de la oficina (de burbujas y de rollo, por medida) como productos simples (categoría de la que ya
--   tenía «Bolsas De Burbujas»), para llevar su stock.
-- * Remisión a cualquier bodega externa del país: `wms_enviar_a_externa` (la de Dropi, `wms_enviar_a_dropi`, la usa). Los envíos
--   siguen en `wms_envios_dropi` (su `bodega_dropi_id` es la bodega externa de destino).
-- * Corte de una bodega externa (`wms_cortes_externa`): lo que había en ella el día que se conectó, la base para cuadrarla
--   después con las remisiones. Se toma hoy el de Dropi Costa Rica (bodega B15) con la última lectura de «Mis productos».
-- Se puede correr dos veces. Reversa: supabase/rollbacks/0217_rollback.sql.

-- Bodega «Oficina» de Costa Rica.
insert into wms_bodegas (pais_id, nombre, codigo, tipo, orden)
select p.id, 'Oficina', 'oficina', 'propia', 0
  from paises p
 where p.codigo = 'CR'
   and not exists (select 1 from wms_bodegas b where b.pais_id = p.id and b.codigo = 'oficina');

update wms_bodegas b set activa = false, actualizado_en = now()
  from paises p
 where p.id = b.pais_id and p.codigo = 'CR' and b.activa and b.codigo in ('despacho', 'fulfillment')
   and not exists (select 1 from wms_stock s where s.bodega_id = b.id and (s.fisico <> 0 or s.reservado <> 0));

-- Bolsas de empaque por medida.
insert into skus_maestros (codigo, nombre, tipo, estado, clase, categoria_id)
select n.codigo, n.nombre, 'simple', 'aprobado', 'fisico',
       (select categoria_id from skus_maestros where codigo = 'BOLSAS/BURBUJAS')
  from (values
    ('BOLSAS/BURBUJAS/15X24', 'Bolsas de burbujas 15x24'),
    ('BOLSAS/BURBUJAS/25X30', 'Bolsas de burbujas 25x30'),
    ('BOLSAS/ROLLO/17X30', 'Bolsas de rollo 17x30'),
    ('BOLSAS/ROLLO/25X35', 'Bolsas de rollo 25x35'),
    ('BOLSAS/ROLLO/32X45', 'Bolsas de rollo 32x45'),
    ('BOLSAS/ROLLO/38X52', 'Bolsas de rollo 38x52')
  ) as n(codigo, nombre)
 where not exists (select 1 from skus_maestros m where lower(btrim(m.codigo)) = lower(n.codigo));

-- Remisión a una bodega externa: sale de una bodega propia y queda «en camino» hasta que el tercero diga cuántas llegaron.
create or replace function wms_enviar_a_externa(
  p_sku uuid,
  p_desde uuid,
  p_hacia uuid,
  p_cantidad integer,
  p_lote uuid default null,
  p_referencia text default null,
  p_usuario uuid default null
) returns uuid
language plpgsql as $$
declare
  v_desde record;
  v_hacia record;
  v_envio uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  select pais_id, tipo, activa into v_desde from wms_bodegas where id = p_desde;
  if not found then raise exception 'La bodega de origen no existe.'; end if;
  if v_desde.tipo <> 'propia' or not v_desde.activa then
    raise exception 'La remisión sale de una bodega propia y activa.';
  end if;
  select pais_id, tipo, activa, nombre into v_hacia from wms_bodegas where id = p_hacia;
  if not found then raise exception 'La bodega de destino no existe.'; end if;
  if v_hacia.tipo <> 'externa' or not v_hacia.activa then
    raise exception 'La remisión va a una bodega externa y activa (entre bodegas propias se usa «Transferir»).';
  end if;
  if v_hacia.pais_id <> v_desde.pais_id then
    raise exception 'Las dos bodegas tienen que ser del mismo país.';
  end if;
  insert into wms_envios_dropi (sku_maestro_id, bodega_origen_id, bodega_dropi_id, enviada, referencia, enviado_por)
  values (p_sku, p_desde, p_hacia, p_cantidad, nullif(btrim(p_referencia), ''), p_usuario)
  returning id into v_envio;
  perform wms_registrar_movimiento(p_sku, p_desde, 'salida', p_cantidad, null, 'envio_dropi',
    coalesce(nullif(btrim(p_referencia), ''), 'Remisión a ' || v_hacia.nombre), 'Remisión a ' || v_hacia.nombre || ' (en camino)', p_usuario, p_lote);
  return v_envio;
end;
$$;

-- La de Dropi queda como atajo: busca la bodega de Dropi del país.
create or replace function wms_enviar_a_dropi(
  p_sku uuid,
  p_desde uuid,
  p_cantidad integer,
  p_lote uuid default null,
  p_referencia text default null,
  p_usuario uuid default null
) returns uuid
language plpgsql as $$
declare
  v_dropi uuid;
begin
  select d.id into v_dropi from wms_bodegas d join wms_bodegas o on o.pais_id = d.pais_id where o.id = p_desde and d.codigo = 'dropi';
  if v_dropi is null then
    raise exception 'Este país no tiene bodega de Dropi.';
  end if;
  return wms_enviar_a_externa(p_sku, p_desde, v_dropi, p_cantidad, p_lote, p_referencia, p_usuario);
end;
$$;

-- Corte de una bodega externa: una fila por producto con lo que había el día que se conectó.
create table if not exists wms_cortes_externa (
  id uuid primary key default uuid_v7(),
  bodega_id uuid not null references wms_bodegas(id),
  fecha date not null,
  sku_maestro_id uuid references skus_maestros(id),
  dropi_producto_id integer,
  nombre text not null,
  cantidad integer not null,
  origen text not null default 'manual' check (origen in ('manual', 'lectura_dropi')),
  creado_en timestamptz not null default now()
);
create unique index if not exists wms_cortes_externa_dropi on wms_cortes_externa (bodega_id, fecha, dropi_producto_id) where dropi_producto_id is not null;
create index if not exists wms_cortes_externa_bodega on wms_cortes_externa (bodega_id, fecha);
alter table wms_cortes_externa enable row level security;

-- El corte de Dropi Costa Rica: lo que la última lectura de «Mis productos» vio en su bodega de Dropi (B15), con el producto
-- vinculado en Gestión de IDs Dropi si lo tiene. Solo una vez (si ya hay un corte de esa bodega, no se toca).
insert into wms_cortes_externa (bodega_id, fecha, sku_maestro_id, dropi_producto_id, nombre, cantidad, origen)
select b.id, (now() at time zone 'America/Costa_Rica')::date,
       (select pu.sku_maestro_id from dropi_publicaciones pu
         where pu.pais_id = p.id and pu.sku_maestro_id is not null and pu.dropi_id ~ ('(^|\D)' || d.dropi_producto_id || '($|\D)')
         order by pu.numero limit 1),
       d.dropi_producto_id, d.nombre, bod.stock, 'lectura_dropi'
  from paises p
  join wms_bodegas b on b.pais_id = p.id and b.codigo = 'dropi'
  join dropi_productos_proveedor d on d.pais_id = p.id
  cross join lateral (
    select coalesce(sum((x->>'stock')::integer), 0) as stock
      from jsonb_array_elements(coalesce(d.bodegas, '[]'::jsonb)) x
     where (x->>'id')::integer = 15
  ) bod
 where p.codigo = 'CR' and bod.stock <> 0
   and not exists (select 1 from wms_cortes_externa c where c.bodega_id = b.id);
