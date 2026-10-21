-- Unir productos duplicados (21 oct 2026).
--
-- Un mismo producto puede estar dos veces en Producto (el mismo artículo con otro nombre de proveedor). `wms_unir_productos(conservar, eliminar)`
-- deja el que se conserva (el más viejo) y pasa a él **todo lo que estaba vinculado al otro** —compras, publicaciones de Dropi, tests de
-- Test productos, Filtro de productos, fichas de Shopify y de Dropi, componentes de compuestos— y después borra el sobrante.
--
--   * Encuentra lo vinculado por las llaves foráneas reales de la base (`pg_constraint`), así que no se queda nada sin mover aunque
--     se agreguen tablas después. Las fichas de Shopify y de Dropi guardan una copia del SKU: pasan a llevar el del producto que queda.
--   * Si el que se conserva no tiene foto y el sobrante sí, le deja la del sobrante.
--   * **Se niega** (y no cambia nada) si el sobrante tiene movimientos de inventario, stock distinto de cero, lotes o variantes, si es de
--     otro tipo (simple/compuesto) que el que se conserva, o si una tabla ya tiene una fila de los dos productos que chocaría al juntarlas:
--     eso se resuelve a mano. El libro de movimientos no se edita nunca.
--   * Todo ocurre en una sola transacción y queda en la actividad del producto que se conserva (`unir_productos`).
--   * `p_aplicar = false` (por defecto) **simula**: hace los cambios, los deshace y devuelve el informe de lo que movería.
--
-- Uso: select wms_unir_productos('<id que se conserva>', '<id que se elimina>', false);   -- simular
--      select wms_unir_productos('<id que se conserva>', '<id que se elimina>', true);    -- aplicar
-- Para deshacer la función: supabase/rollbacks/0120_rollback.sql (lo que ya se unió no se puede separar).

create or replace function _wms_unir_productos(p_conservar uuid, p_eliminar uuid)
returns jsonb
language plpgsql
as $$
declare
  k skus_maestros%rowtype;
  d skus_maestros%rowtype;
  fk record;
  n bigint;
  movido jsonb := '{}'::jsonb;
begin
  if p_conservar is null or p_eliminar is null or p_conservar = p_eliminar then
    raise exception 'Elige dos productos distintos.';
  end if;
  select * into k from skus_maestros where id = p_conservar;
  if not found then raise exception 'El producto que se conserva no existe.'; end if;
  select * into d from skus_maestros where id = p_eliminar;
  if not found then raise exception 'El producto que se elimina no existe (%).', p_eliminar; end if;
  if k.tipo is distinct from d.tipo then
    raise exception 'No se unen: % es % y % es %.', k.codigo, k.tipo, d.codigo, d.tipo;
  end if;
  if k.padre_id is not null or d.padre_id is not null
     or exists (select 1 from skus_maestros where padre_id in (p_conservar, p_eliminar)) then
    raise exception 'No se unen % y %: uno tiene variantes (o es una variante).', k.codigo, d.codigo;
  end if;

  -- Inventario: el libro de movimientos no se edita, así que un producto con historia no se une desde aquí.
  if exists (select 1 from wms_movimientos where sku_maestro_id = p_eliminar) then
    raise exception 'No se unen: % tiene movimientos de inventario. Mueve su stock con un ajuste antes de unirlo.', d.codigo;
  end if;
  if exists (select 1 from wms_stock_ubicacion where sku_maestro_id = p_eliminar and cantidad <> 0)
     or exists (select 1 from wms_lotes where sku_maestro_id = p_eliminar) then
    raise exception 'No se unen: % tiene stock por ubicación o lotes.', d.codigo;
  end if;
  delete from wms_stock_ubicacion where sku_maestro_id = p_eliminar;
  if exists (
    select 1 from wms_stock
    where sku_maestro_id = p_eliminar and (fisico <> 0 or reservado <> 0 or danado <> 0 or inspeccion <> 0 or retenido <> 0 or en_camino <> 0)
  ) then
    raise exception 'No se unen: % tiene stock.', d.codigo;
  end if;
  delete from wms_stock where sku_maestro_id = p_eliminar;

  -- Todo lo demás que apunta al sobrante pasa al que se conserva.
  for fk in
    select con.conrelid::regclass::text as tabla, a.attname::text as columna
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'skus_maestros'::regclass
      and array_length(con.conkey, 1) = 1
      and con.conrelid::regclass::text not in ('skus_maestros', 'wms_stock', 'wms_stock_ubicacion', 'wms_movimientos', 'wms_lotes')
  loop
    begin
      execute format('update %s set %I = $1 where %I = $2', fk.tabla, fk.columna, fk.columna) using p_conservar, p_eliminar;
      get diagnostics n = row_count;
    exception when unique_violation then
      raise exception 'No se unen % y %: en % ya hay una fila de cada uno que chocaría al juntarlas. Júntalas a mano.', k.codigo, d.codigo, fk.tabla;
    end;
    if n > 0 then movido := movido || jsonb_build_object(fk.tabla || '.' || fk.columna, n); end if;
  end loop;

  -- Las fichas de canal guardan una copia del SKU.
  update wms_producto_variantes set sku = k.codigo where sku_maestro_id = p_conservar;
  update wms_dropi_productos set sku = k.codigo where sku_maestro_id = p_conservar;

  if k.foto_url is null and d.foto_url is not null then
    update skus_maestros set foto_url = d.foto_url, foto_huella = d.foto_huella where id = p_conservar;
    movido := movido || jsonb_build_object('foto', true);
  end if;

  delete from skus_maestros where id = p_eliminar;

  insert into historial_auditoria (usuario_nombre, accion, entidad, entidad_id, detalle, antes, despues)
  values ('Unir productos', 'unir_productos', 'skus_maestros', p_conservar::text, 'Se unió ' || d.codigo || ' (' || d.nombre || ')', jsonb_build_object('Eliminado', d.codigo), jsonb_build_object('Conservado', k.codigo));

  return jsonb_build_object('conservado', k.codigo, 'eliminado', d.codigo, 'movido', movido);
end;
$$;

create or replace function wms_unir_productos(p_conservar uuid, p_eliminar uuid, p_aplicar boolean default false)
returns jsonb
language plpgsql
as $$
declare
  informe jsonb;
begin
  begin
    informe := _wms_unir_productos(p_conservar, p_eliminar);
    if not p_aplicar then
      -- Simulación: se deshace todo lo hecho dentro de este bloque y solo queda el informe.
      raise exception 'simulacion' using errcode = 'XS001';
    end if;
  exception when sqlstate 'XS001' then
    return informe || jsonb_build_object('simulacion', true);
  end;
  return informe || jsonb_build_object('simulacion', false);
end;
$$;

-- Solo el servidor (clave de servicio) y quien corre SQL en Supabase pueden llamarlas.
revoke all on function _wms_unir_productos(uuid, uuid) from public, anon, authenticated;
revoke all on function wms_unir_productos(uuid, uuid, boolean) from public, anon, authenticated;
