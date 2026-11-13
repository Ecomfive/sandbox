-- Producto › «Quitar» una variante que se cargó por error y tuvo movimientos que se anulan (13 nov 2026, pedido de Jhokser: la 44-45 de las plantillas azules, en 0, no se dejaba
-- quitar). La 0269 borra de `wms_movimientos` los movimientos de la variante cuando suman cero, pero el candado del libro (`wms_movimientos_inmutable`, 0069/0260) no deja borrar
-- nada: «El libro de movimientos no se edita ni se borra». Nunca pudo quitar una variante con movimientos. Ahora el candado deja borrar solo dentro de `wms_quitar_variante`
-- (marca `wms.quitar_variante`, local a la transacción) y esa función solo borra después de comprobar que los movimientos de esa variante suman cero en cada bodega y cubeta y que
-- nada más la usa. La unión de productos (0260) sigue igual.
-- Reversa: supabase/rollbacks/0289_rollback.sql

create or replace function wms_movimientos_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and current_setting('wms.unir_productos', true) = 'si'
     and (to_jsonb(new) - 'sku_maestro_id') = (to_jsonb(old) - 'sku_maestro_id') then
    return new;
  end if;
  if tg_op = 'DELETE' and current_setting('wms.quitar_variante', true) = 'si' then
    return old;
  end if;
  raise exception 'El libro de movimientos no se edita ni se borra.';
end;
$$;

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

  -- El libro no se borra, salvo estos movimientos que ya se comprobaron en cero (el candado lo deja pasar solo con esta marca, que dura lo que la transacción).
  perform set_config('wms.quitar_variante', 'si', true);
  delete from wms_movimientos where sku_maestro_id = p_id;
  perform set_config('wms.quitar_variante', '', true);
  delete from wms_stock_ubicacion where sku_maestro_id = p_id;
  delete from wms_stock where sku_maestro_id = p_id;
  delete from skus_maestros where id = p_id;

  return jsonb_build_object('quitada', true, 'codigo', p.codigo, 'padre_id', p.padre_id, 'movimientos', movimientos, 'bloqueos', '{}'::jsonb);
end;
$$;

revoke all on function wms_quitar_variante(uuid) from public, anon, authenticated;
