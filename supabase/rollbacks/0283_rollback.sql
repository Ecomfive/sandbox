-- Reversa de 0283: vuelve a la regla de la 0273 (también el conteo se redirige al principal sin repartir).
create or replace function wms_registrar_movimiento(
  p_sku uuid,
  p_bodega uuid,
  p_tipo text,
  p_cantidad integer,
  p_ubicacion uuid default null,
  p_origen text default 'manual',
  p_referencia text default null,
  p_motivo text default null,
  p_usuario uuid default null,
  p_lote uuid default null,
  p_lote_codigo text default null,
  p_vencimiento date default null
) returns uuid
language plpgsql as $$
declare
  v_tipo_bodega text;
  v_propiedad text;
  v_cubeta text;
  v_delta integer;
  v_cambios jsonb;
  v_id uuid;
  v_maneja boolean;
  v_lote uuid := p_lote;
  v_asignado record;
  v_padre uuid;
  v_codigo_variante text;
begin
  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'La cantidad no puede ser cero.';
  end if;
  if p_tipo in ('entrada', 'salida', 'reserva', 'liberacion') and p_cantidad < 0 then
    raise exception 'La cantidad de una % debe ser positiva.', p_tipo;
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste', 'reserva', 'liberacion') then
    raise exception 'Tipo de movimiento no válido: %.', p_tipo;
  end if;
  if p_tipo = 'ajuste' and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Un ajuste necesita un motivo.';
  end if;

  -- Variante de un producto con el stock pendiente de repartir: lo que sale se descuenta del stock general del principal.
  if p_origen <> 'reparto' and p_tipo in ('salida', 'reserva', 'liberacion') then
    select h.padre_id, h.codigo into v_padre, v_codigo_variante
    from skus_maestros h
    join skus_maestros p on p.id = h.padre_id and p.reparto_pendiente and not p.maneja_vencimiento
    where h.id = p_sku;
    if v_padre is not null then
      return wms_registrar_movimiento(
        v_padre, p_bodega, p_tipo, p_cantidad, null, p_origen,
        btrim(coalesce(p_referencia, '') || ' · de ' || v_codigo_variante), p_motivo, p_usuario
      );
    end if;
  end if;

  select tipo into v_tipo_bodega from wms_bodegas where id = p_bodega;
  if not found then
    raise exception 'La bodega no existe.';
  end if;
  if v_tipo_bodega = 'externa' and p_origen not in ('sync_dropi', 'sync_shopify') then
    raise exception 'Esta bodega es externa: su stock solo lo cambia la sincronización.';
  end if;
  select maneja_vencimiento into v_maneja from skus_maestros where id = p_sku;
  if not found then
    raise exception 'El SKU maestro no existe.';
  end if;
  if not v_maneja and (p_lote is not null or p_lote_codigo is not null or p_vencimiento is not null) then
    raise exception 'Este producto no maneja vencimiento.';
  end if;

  if p_ubicacion is not null then
    select propiedad into v_propiedad from wms_ubicaciones where id = p_ubicacion and bodega_id = p_bodega;
    if not found then
      raise exception 'La ubicación no es de esa bodega.';
    end if;
  end if;

  -- Producto con vencimiento: de qué lote se mueve.
  if v_maneja and p_tipo in ('entrada', 'salida', 'ajuste') then
    if p_tipo = 'salida' and p_lote is null and coalesce(btrim(p_lote_codigo), '') = '' then
      -- Sin lote: FEFO. Un movimiento por cada lote del que sale.
      for v_asignado in select * from wms_asignar_lotes(p_sku, p_bodega, p_cantidad) loop
        v_id := wms_registrar_movimiento(p_sku, p_bodega, 'salida', v_asignado.cantidad, p_ubicacion, p_origen, p_referencia, p_motivo, p_usuario, v_asignado.lote_id);
      end loop;
      return v_id;
    end if;
    if v_lote is null then
      if coalesce(btrim(p_lote_codigo), '') = '' then
        raise exception 'Este producto maneja vencimiento: indica el lote.';
      end if;
      select id into v_lote from wms_lotes where sku_maestro_id = p_sku and lower(btrim(codigo)) = lower(btrim(p_lote_codigo));
      if v_lote is null then
        if p_tipo <> 'entrada' then
          raise exception 'El lote % no existe.', p_lote_codigo;
        end if;
        if p_vencimiento is null then
          raise exception 'Un lote nuevo necesita su fecha de vencimiento.';
        end if;
        insert into wms_lotes (sku_maestro_id, codigo, fecha_vencimiento, creado_por)
        values (p_sku, btrim(p_lote_codigo), p_vencimiento, p_usuario)
        returning id into v_lote;
      elsif p_tipo = 'entrada' and p_vencimiento is not null and p_vencimiento <> (select fecha_vencimiento from wms_lotes where id = v_lote) then
        raise exception 'El lote ya existe con otra fecha de vencimiento.';
      end if;
    elsif not exists (select 1 from wms_lotes where id = v_lote and sku_maestro_id = p_sku) then
      raise exception 'El lote no es de ese producto.';
    end if;
  else
    v_lote := null;
  end if;

  if p_tipo in ('entrada', 'salida', 'ajuste') then
    v_delta := case p_tipo when 'entrada' then p_cantidad when 'salida' then -p_cantidad else p_cantidad end;
    v_cambios := jsonb_build_object('fisico', v_delta);
    v_cubeta := wms_cubeta_de_propiedad(v_propiedad);
    if v_cubeta is not null then
      v_cambios := v_cambios || jsonb_build_object(v_cubeta, v_delta);
    end if;
  elsif p_tipo = 'reserva' then
    v_cambios := jsonb_build_object('reservado', p_cantidad);
  else
    v_cambios := jsonb_build_object('reservado', -p_cantidad);
  end if;

  perform wms_aplicar_cambios(p_sku, p_bodega, v_cambios);

  if p_ubicacion is not null and p_tipo in ('entrada', 'salida', 'ajuste') then
    insert into wms_stock_ubicacion (sku_maestro_id, ubicacion_id, cantidad) values (p_sku, p_ubicacion, v_delta)
    on conflict (sku_maestro_id, ubicacion_id) do update set cantidad = wms_stock_ubicacion.cantidad + v_delta, actualizado_en = now();
  end if;
  if v_lote is not null then
    insert into wms_stock_lote (lote_id, bodega_id, cantidad) values (v_lote, p_bodega, v_delta)
    on conflict (lote_id, bodega_id) do update set cantidad = wms_stock_lote.cantidad + v_delta, actualizado_en = now();
  end if;

  insert into wms_movimientos (sku_maestro_id, bodega_id, ubicacion_id, tipo, cambios, origen, referencia, motivo, usuario_id, lote_id)
  values (p_sku, p_bodega, p_ubicacion, p_tipo, v_cambios, p_origen, p_referencia, p_motivo, p_usuario, v_lote)
  returning id into v_id;
  return v_id;
end;
$$;
