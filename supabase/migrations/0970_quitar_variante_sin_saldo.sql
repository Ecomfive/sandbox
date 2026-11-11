-- Producto › «Quitar» una variante que se cargó por error (pedido de Hernán, 11 nov 2026: Dinora creó las Botas Maxi Pro por talla, después por
-- talla y color, sumó inventario a las de solo talla y lo dejó en 0; «Quitar» no la dejaba porque tenía movimientos).
-- Una variante se puede quitar aunque tenga movimientos de inventario si esos movimientos se anulan entre sí (por bodega y por cubeta suman 0)
-- y no le queda stock en ninguna parte. Todo lo demás que la use (compras, fichas de Shopify o Dropi, un compuesto, lotes, traslados…) la sigue
-- bloqueando, como en `wms_eliminar_producto` (0125). Se borran sus movimientos, su stock en cero y la variante, todo junto o nada.
-- Código: src/app/(app)/producto/actions.ts › quitarVariante (deja en la Actividad cuántos movimientos tenía).
-- Reversa: supabase/rollbacks/0970_rollback.sql

create or replace function wms_quitar_variante(p_id uuid)
returns jsonb
language plpgsql
as $$
declare
  p skus_maestros%rowtype;
  fk record;
  n bigint;
  movimientos bigint;
  descuadre bigint;
  bloqueos jsonb := '{}'::jsonb;
  condicion text;
begin
  select * into p from skus_maestros where id = p_id;
  if not found then
    raise exception 'La variante no existe.';
  end if;
  if p.padre_id is null then
    raise exception 'No es una variante.';
  end if;

  -- Los movimientos solo bloquean si dejaron algo: se suman por bodega y por cubeta (fisico, reservado…).
  select count(*) into movimientos from wms_movimientos where sku_maestro_id = p_id;
  select count(*) into descuadre from (
    select m.bodega_id, c.key, sum(c.value::numeric) as total
    from wms_movimientos m
    cross join lateral jsonb_each_text(coalesce(m.cambios, '{}'::jsonb)) c
    where m.sku_maestro_id = p_id and c.value ~ '^-?[0-9]+(\.[0-9]+)?$'
    group by m.bodega_id, c.key
  ) x
  where x.total <> 0;
  if descuadre > 0 then
    bloqueos := bloqueos || jsonb_build_object('wms_movimientos.sku_maestro_id', movimientos);
  end if;

  for fk in
    select con.conrelid::regclass::text as tabla, a.attname::text as columna
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'skus_maestros'::regclass
      and array_length(con.conkey, 1) = 1
  loop
    if fk.tabla = 'wms_movimientos' then
      continue;
    end if;
    -- El stock en cero no es historia; con algo distinto de cero, bloquea.
    condicion := case fk.tabla
      when 'wms_stock' then ' and (fisico <> 0 or reservado <> 0 or danado <> 0 or inspeccion <> 0 or retenido <> 0 or en_camino <> 0)'
      when 'wms_stock_ubicacion' then ' and cantidad <> 0'
      else ''
    end;
    execute format('select count(*) from %s where %I = $1%s', fk.tabla, fk.columna, condicion) into n using p_id;
    if n > 0 then
      bloqueos := bloqueos || jsonb_build_object(fk.tabla || '.' || fk.columna, n);
    end if;
  end loop;

  if bloqueos <> '{}'::jsonb then
    return jsonb_build_object('quitada', false, 'codigo', p.codigo, 'bloqueos', bloqueos);
  end if;

  delete from wms_movimientos where sku_maestro_id = p_id;
  delete from wms_stock_ubicacion where sku_maestro_id = p_id;
  delete from wms_stock where sku_maestro_id = p_id;
  delete from skus_maestros where id = p_id;

  return jsonb_build_object('quitada', true, 'codigo', p.codigo, 'padre_id', p.padre_id, 'movimientos', movimientos, 'bloqueos', '{}'::jsonb);
end;
$$;

revoke all on function wms_quitar_variante(uuid) from public, anon, authenticated;
