-- Unir productos con variantes (23 nov 2026, pedido de Hernán: Lentes Smart (#0106, 8 graduaciones) es el mismo que Lentes de Lectura TR90 con
-- Estuche (#1344, 7 graduaciones) y no se podía unir: «quiero que las variantes también se puedan unir»).
-- 1) `_wms_unir_productos` (0260) deja unir variante con variante y producto con producto cuando el que se elimina ya no tiene variantes; a un
--    producto con variantes no le entra stock suelto (debe estar en una variante). Lo demás es igual que en 0260.
-- 2) `wms_unir_productos_variantes(conservar, eliminar, pares, aplicar)`: une cada variante del que se elimina con su pareja del que queda
--    (`pares`: { id de la variante que se va: id de la variante que queda }); la que no tiene pareja pasa al que queda como variante nueva; al
--    final une los dos productos. Con `aplicar = false` solo simula (hace todo y lo deshace), igual que `wms_unir_productos`.
-- Solo el servidor (clave de servicio). Se puede correr más de una vez. Reversa: supabase/rollbacks/0355_rollback.sql (vuelve a la regla de 0260;
-- lo que ya se unió no se separa).

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
  -- Variantes (23 nov 2026, pedido de Hernán: «quiero que las variantes también se puedan unir»):
  --   * una variante se une con otra variante (de este producto o de otro): su inventario y lo vinculado pasan a la que queda;
  --   * un producto principal solo se une con otro principal, y el que se elimina ya no puede tener variantes (se unen o se pasan antes:
  --     `wms_unir_productos_variantes`);
  --   * a un producto que lleva el inventario en sus variantes no le entra stock suelto: el que se elimina no puede tener inventario.
  if (k.padre_id is null) <> (d.padre_id is null) then
    raise exception 'No se unen % y %: uno es una variante y el otro no. Une variante con variante, o producto con producto.', k.codigo, d.codigo;
  end if;
  if exists (select 1 from skus_maestros where padre_id = p_eliminar) then
    raise exception 'No se unen % y %: % todavía tiene variantes. Únelas o pásalas primero.', k.codigo, d.codigo, d.codigo;
  end if;
  if exists (select 1 from skus_maestros where padre_id = p_conservar)
     and (exists (select 1 from wms_lotes where sku_maestro_id = p_eliminar)
          or exists (select 1 from wms_stock where sku_maestro_id = p_eliminar and (fisico <> 0 or reservado <> 0 or danado <> 0 or inspeccion <> 0 or retenido <> 0 or en_camino <> 0))) then
    raise exception 'No se unen % y %: % tiene inventario sin variante y % lo lleva por variante. Pasa ese stock a una variante antes de unir.', k.codigo, d.codigo, d.codigo, k.codigo;
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

create or replace function wms_unir_productos_variantes(p_conservar uuid, p_eliminar uuid, p_pares jsonb default '{}'::jsonb, p_aplicar boolean default false)
returns jsonb
language plpgsql
as $$
declare
  k skus_maestros%rowtype;
  d skus_maestros%rowtype;
  h record;
  destino uuid;
  variantes jsonb := '[]'::jsonb;
  informe jsonb;
begin
  begin
    select * into k from skus_maestros where id = p_conservar;
    if not found then raise exception 'El producto que se conserva no existe.'; end if;
    select * into d from skus_maestros where id = p_eliminar;
    if not found then raise exception 'El producto que se elimina no existe (%).', p_eliminar; end if;
    if k.padre_id is not null or d.padre_id is not null then
      raise exception 'No se unen % y %: elige los productos, no sus variantes.', k.codigo, d.codigo;
    end if;
    if k.tipo is distinct from d.tipo then
      raise exception 'No se unen: % es % y % es %.', k.codigo, k.tipo, d.codigo, d.tipo;
    end if;
    for h in select id, codigo from skus_maestros where padre_id = p_eliminar order by codigo loop
      destino := nullif(coalesce(p_pares, '{}'::jsonb) ->> h.id::text, '')::uuid;
      if destino is null then
        -- Sin pareja: pasa al que queda como una variante más, con su código y todo lo suyo.
        update skus_maestros set padre_id = p_conservar where id = h.id;
        variantes := variantes || jsonb_build_object('variante', h.codigo, 'pasa', true);
      else
        if not exists (select 1 from skus_maestros where id = destino and padre_id = p_conservar) then
          raise exception 'No se unen % y %: la pareja elegida para % no es una variante de %.', k.codigo, d.codigo, h.codigo, k.codigo;
        end if;
        variantes := variantes || (_wms_unir_productos(destino, h.id) || jsonb_build_object('variante', h.codigo));
      end if;
    end loop;
    informe := _wms_unir_productos(p_conservar, p_eliminar) || jsonb_build_object('variantes', variantes);
    if not p_aplicar then
      raise exception 'simulacion' using errcode = 'XS001';
    end if;
  exception when sqlstate 'XS001' then
    return informe || jsonb_build_object('simulacion', true);
  end;
  return informe || jsonb_build_object('simulacion', false);
end;
$$;

revoke all on function _wms_unir_productos(uuid, uuid) from public, anon, authenticated;
revoke all on function wms_unir_productos_variantes(uuid, uuid, jsonb, boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Revisión: las dos deben decir «sí».
select
  case when exists (select 1 from pg_proc where proname = 'wms_unir_productos_variantes') then 'sí' else 'NO' end as funcion_variantes,
  case when position('todavía tiene variantes' in (select prosrc from pg_proc where proname = '_wms_unir_productos' limit 1)) > 0 then 'sí' else 'NO' end as regla_nueva;
