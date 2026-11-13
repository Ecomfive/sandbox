-- Producto › «Quitar» una variante creada por error: un vínculo automático con una variación de Dropi ya no la bloquea (13 nov 2026, pedido de Jhokser: la variante 44-45 de las
-- plantillas azules, en 0, no se dejaba quitar). La lectura de «Mis productos» de Dropi vincula sola cada variante con la variación que se le parece (`dropi_variaciones_vinculo`,
-- `como = 'auto'`, 0261) y esa fila contaba como «uso» en `wms_quitar_variante` (0269). Ahora solo bloquea un vínculo hecho a mano (`como = 'manual'`); el automático se va con la
-- variante (la llave foránea borra en cascada). Todo lo demás sigue igual.
-- Reversa: supabase/rollbacks/0287_rollback.sql

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
    -- El stock en cero no es historia; con algo distinto de cero, bloquea. Un vínculo automático con Dropi tampoco: solo el hecho a mano.
    condicion := case fk.tabla
      when 'wms_stock' then ' and (fisico <> 0 or reservado <> 0 or danado <> 0 or inspeccion <> 0 or retenido <> 0 or en_camino <> 0)'
      when 'wms_stock_ubicacion' then ' and cantidad <> 0'
      when 'dropi_variaciones_vinculo' then ' and como = ''manual'''
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
