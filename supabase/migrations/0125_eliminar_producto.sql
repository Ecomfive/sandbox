-- Eliminar un producto (21 oct 2026).
--
-- `wms_eliminar_producto(p_id)` borra un producto de `skus_maestros` **solo si nada depende de él**. Sirve para quitar lo que se
-- creó por error o de más; un producto que ya se compró, se vendió o se publicó se pasa a Inactivo o Descontinuado, no se borra.
--
--   * Busca lo que apunta al producto por las llaves foráneas reales de la base (`pg_constraint`), así que cubre también las tablas
--     que se agreguen después: compras, publicaciones de Dropi, tests, Filtro de productos, fichas de Shopify y de Dropi, variantes,
--     compuestos que lo usan como componente, movimientos, lotes, etc. Si encuentra alguna fila, **no borra nada** y devuelve qué
--     tabla y cuántas filas lo bloquean.
--   * Lo que es solo suyo y no tiene historia se va con él: el stock en cero (`wms_stock`, `wms_stock_ubicacion`) y, si es un
--     compuesto, la lista de sus componentes. Stock distinto de cero bloquea.
--   * Todo en una transacción. No escribe la actividad: la deja la acción del servidor (`eliminar_producto`).
--
-- Devuelve {"eliminado": true|false, "codigo", "nombre", "foto_url", "bloqueos": {"tabla.columna": n}}.
-- Uso: select wms_eliminar_producto('<id>');
-- Para deshacer la función: supabase/rollbacks/0125_rollback.sql (un producto ya borrado no se recupera).

create or replace function wms_eliminar_producto(p_id uuid)
returns jsonb
language plpgsql
as $$
declare
  p skus_maestros%rowtype;
  fk record;
  n bigint;
  bloqueos jsonb := '{}'::jsonb;
  condicion text;
begin
  select * into p from skus_maestros where id = p_id;
  if not found then
    raise exception 'El producto no existe.';
  end if;

  for fk in
    select con.conrelid::regclass::text as tabla, a.attname::text as columna
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'skus_maestros'::regclass
      and array_length(con.conkey, 1) = 1
  loop
    -- La lista de componentes de un compuesto es suya: se va con él.
    if fk.tabla = 'sku_maestro_componentes' and fk.columna = 'combo_id' then
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
    return jsonb_build_object('eliminado', false, 'codigo', p.codigo, 'nombre', p.nombre, 'foto_url', p.foto_url, 'bloqueos', bloqueos);
  end if;

  delete from wms_stock_ubicacion where sku_maestro_id = p_id;
  delete from wms_stock where sku_maestro_id = p_id;
  delete from sku_maestro_componentes where combo_id = p_id;
  delete from skus_maestros where id = p_id;

  return jsonb_build_object('eliminado', true, 'codigo', p.codigo, 'nombre', p.nombre, 'foto_url', p.foto_url, 'bloqueos', '{}'::jsonb);
end;
$$;

-- Solo el servidor (clave de servicio) y quien corre SQL en Supabase pueden llamarla.
revoke all on function wms_eliminar_producto(uuid) from public, anon, authenticated;
