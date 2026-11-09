-- Unir productos duplicados con su inventario (9 nov 2026, pedido de Hernán: «este producto es el mismo y no me deja unirlo»).
--
-- Hasta ahora `wms_unir_productos` (0121) se negaba si el duplicado tenía movimientos de inventario, aunque su stock quedara en cero: el
-- duplicado no se podía borrar mientras el libro lo nombrara. Caso real: CAPSULAS/RAIZ/REMOLACHA (#0449) tenía 480 u. contadas en un
-- levantamiento y era el mismo producto que REMOLACHA/CAPSULAS/60CAP (#0146).
--
-- Ahora, al unir, el inventario del duplicado **pasa al que se queda**:
--   * Su stock por bodega y por ubicación se suma al del que queda (cada cubeta: físico, reservado, dañado…).
--   * Sus cajas se suman (mismo lugar y mismo tamaño de caja: se juntan las cantidades).
--   * Sus lotes pasan al que queda con sus unidades. Si los dos tienen un lote con el mismo código, se niega: eso se junta a mano.
--   * Sus movimientos pasan al que queda: **solo cambia el producto** al que apuntan; la cantidad, la fecha, la bodega, quién y la
--     referencia quedan igual. El libro sigue sin poder editarse ni borrarse: la única excepción es esta, dentro de la unión, y el
--     candado revisa que nada más cambie.
--   * Se sigue negando con variantes, con tipos distintos (simple/compuesto) y si uno maneja vencimiento y el otro no y el duplicado
--     tiene stock o lotes.
-- Todo en una sola transacción; la simulación (`p_aplicar = false`) lo deshace igual que antes. Queda en la actividad del que se queda.
-- Reversa: supabase/rollbacks/0258_rollback.sql (vuelve a la regla de 0121; lo que ya se unió no se separa).

-- El libro no se edita ni se borra; solo la unión de productos cambia el producto de un movimiento, y nada más.
create or replace function wms_movimientos_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and current_setting('wms.unir_productos', true) = 'si'
     and (to_jsonb(new) - 'sku_maestro_id') = (to_jsonb(old) - 'sku_maestro_id') then
    return new;
  end if;
  raise exception 'El libro de movimientos no se edita ni se borra.';
end;
$$;

create or replace function _wms_unir_productos(p_conservar uuid, p_eliminar uuid)
returns jsonb
language plpgsql
as $$
declare
  k skus_maestros%rowtype;
  d skus_maestros%rowtype;
  fk record;
  n bigint;
  unidades bigint;
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

  -- Inventario: pasa todo al que se queda.
  if coalesce(k.maneja_vencimiento, false) <> coalesce(d.maneja_vencimiento, false)
     and (exists (select 1 from wms_lotes where sku_maestro_id = p_eliminar)
          or exists (select 1 from wms_stock where sku_maestro_id = p_eliminar and (fisico <> 0 or reservado <> 0 or danado <> 0 or inspeccion <> 0 or retenido <> 0 or en_camino <> 0))) then
    raise exception 'No se unen % y %: uno maneja vencimiento y el otro no. Déjalos iguales antes de unir.', k.codigo, d.codigo;
  end if;
  if exists (
    select 1 from wms_lotes a join wms_lotes b on lower(btrim(a.codigo)) = lower(btrim(b.codigo))
    where a.sku_maestro_id = p_eliminar and b.sku_maestro_id = p_conservar
  ) then
    raise exception 'No se unen % y %: los dos tienen un lote con el mismo código. Júntalos a mano.', k.codigo, d.codigo;
  end if;

  select coalesce(sum(fisico), 0) into unidades from wms_stock where sku_maestro_id = p_eliminar;
  insert into wms_stock (sku_maestro_id, bodega_id, fisico, reservado, danado, inspeccion, retenido, en_camino)
  select p_conservar, bodega_id, fisico, reservado, danado, inspeccion, retenido, en_camino from wms_stock where sku_maestro_id = p_eliminar
  on conflict (sku_maestro_id, bodega_id) do update set
    fisico = wms_stock.fisico + excluded.fisico,
    reservado = wms_stock.reservado + excluded.reservado,
    danado = wms_stock.danado + excluded.danado,
    inspeccion = wms_stock.inspeccion + excluded.inspeccion,
    retenido = wms_stock.retenido + excluded.retenido,
    en_camino = wms_stock.en_camino + excluded.en_camino,
    actualizado_en = now();
  delete from wms_stock where sku_maestro_id = p_eliminar;
  if unidades <> 0 then movido := movido || jsonb_build_object('unidades', unidades); end if;

  insert into wms_stock_ubicacion (sku_maestro_id, ubicacion_id, cantidad)
  select p_conservar, ubicacion_id, cantidad from wms_stock_ubicacion where sku_maestro_id = p_eliminar
  on conflict (sku_maestro_id, ubicacion_id) do update set cantidad = wms_stock_ubicacion.cantidad + excluded.cantidad, actualizado_en = now();
  delete from wms_stock_ubicacion where sku_maestro_id = p_eliminar;

  insert into wms_cajas (bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja, cajas, observacion, actualizado_por)
  select bodega_id, p_conservar, ubicacion_id, unidades_por_caja, cajas, observacion, actualizado_por from wms_cajas where sku_maestro_id = p_eliminar
  on conflict (bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja) do update set cajas = wms_cajas.cajas + excluded.cajas, actualizado_en = now();
  delete from wms_cajas where sku_maestro_id = p_eliminar;
  get diagnostics n = row_count;
  if n > 0 then movido := movido || jsonb_build_object('wms_cajas', n); end if;

  update wms_lotes set sku_maestro_id = p_conservar where sku_maestro_id = p_eliminar;
  get diagnostics n = row_count;
  if n > 0 then movido := movido || jsonb_build_object('wms_lotes', n); end if;

  perform set_config('wms.unir_productos', 'si', true);
  update wms_movimientos set sku_maestro_id = p_conservar where sku_maestro_id = p_eliminar;
  get diagnostics n = row_count;
  perform set_config('wms.unir_productos', '', true);
  if n > 0 then movido := movido || jsonb_build_object('wms_movimientos', n); end if;

  -- Todo lo demás que apunta al sobrante pasa al que se conserva.
  for fk in
    select con.conrelid::regclass::text as tabla, a.attname::text as columna
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'skus_maestros'::regclass
      and array_length(con.conkey, 1) = 1
      and con.conrelid::regclass::text not in ('skus_maestros', 'wms_stock', 'wms_stock_ubicacion', 'wms_movimientos', 'wms_lotes', 'wms_cajas')
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
  values ('Unir productos', 'unir_productos', 'skus_maestros', p_conservar::text,
          'Se unió ' || d.codigo || ' (' || d.nombre || ')' || case when unidades <> 0 then ' con sus ' || unidades || ' u. de inventario' else '' end,
          jsonb_build_object('Eliminado', d.codigo), jsonb_build_object('Conservado', k.codigo));

  return jsonb_build_object('conservado', k.codigo, 'eliminado', d.codigo, 'movido', movido);
end;
$$;

revoke all on function _wms_unir_productos(uuid, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
