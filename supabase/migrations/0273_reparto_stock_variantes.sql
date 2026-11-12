-- Stock general «pendiente de repartir» entre las variantes de un producto (11 nov 2026, pedido de Jhokser).
--
-- Hasta hoy, para darle variantes a un producto con stock había que llevarlo a cero y repartirlo entre las variantes con números que a veces eran solo una división
-- provisional (así quedó el mini ventilador, por color). Ahora el producto principal puede **conservar su stock como general** mientras se cuenta cuánto hay de cada variante:
--
--   * `skus_maestros.reparto_pendiente` marca al producto principal con el stock sin repartir. Mientras esté en verdadero, el principal **sí puede mover inventario** (el trigger
--     `wms_movimientos_sin_padre` de la 0078 lo prohibía) y ese es el «número general».
--   * Mientras tanto, una **salida, reserva o liberación de una variante se descuenta del stock general del principal** (en `wms_registrar_movimiento`), con la variante en la
--     referencia. Una entrada de una variante entra a la variante. El saldo del principal puede quedar negativo, como el de cualquier producto.
--   * `wms_dejar_reparto_pendiente(principal, usuario)`: devuelve al principal lo que hoy tienen sus variantes y lo deja pendiente de repartir (para un producto cuyo reparto
--     fue provisional, como el mini ventilador). `wms_repartir_stock_variantes(principal, reparto, usuario)`: reparte el stock general entre las variantes **por bodega y exacto**
--     (lo repartido en cada bodega es lo que tiene el principal ahí), y quita la marca.
--   * Los movimientos de estas dos funciones llevan origen `reparto`. Nada de esto toca los productos sin variantes ni los que ya las tienen con su stock repartido.
--   * Un producto con vencimiento no usa esto (los lotes no se pueden pasar sin decidir de cuál sale cada unidad): la base lo rechaza.
--
-- Código: src/app/(app)/producto/reparto-actions.ts, producto/reparto-stock.tsx. Reversa: supabase/rollbacks/0273_rollback.sql

alter table skus_maestros
  add column if not exists reparto_pendiente boolean not null default false,
  add column if not exists reparto_pendiente_desde timestamptz;

alter table wms_movimientos drop constraint if exists wms_movimientos_origen_check;
alter table wms_movimientos add constraint wms_movimientos_origen_check
  check (origen in ('manual', 'sync_dropi', 'sync_shopify', 'pedido', 'conteo', 'transferencia', 'envio_dropi', 'compra', 'reparto'));

-- Un producto con variantes no mueve inventario, salvo que su stock esté pendiente de repartir: ese es el stock general.
create or replace function wms_movimientos_sin_padre() returns trigger language plpgsql as $$
begin
  if exists (select 1 from skus_maestros where padre_id = new.sku_maestro_id)
     and not exists (select 1 from skus_maestros where id = new.sku_maestro_id and reparto_pendiente) then
    raise exception 'Este producto tiene variantes: el inventario se mueve en cada variante.';
  end if;
  return new;
end;
$$;

-- El movimiento de siempre (0073) con una regla más: mientras el principal tenga el stock pendiente de repartir, lo que sale de una variante sale del stock general.
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

-- Deja el stock de las variantes como stock general del principal, pendiente de repartir (un reparto provisional, como el del mini ventilador por color).
create or replace function wms_dejar_reparto_pendiente(p_padre uuid, p_usuario uuid default null)
returns jsonb
language plpgsql
as $$
declare
  p skus_maestros%rowtype;
  s record;
  movidas integer := 0;
  unidades integer := 0;
begin
  select * into p from skus_maestros where id = p_padre for update;
  if not found then raise exception 'El producto no existe.'; end if;
  if p.padre_id is not null then raise exception 'Una variante no tiene stock general: es del producto principal.'; end if;
  if not exists (select 1 from skus_maestros where padre_id = p_padre) then raise exception 'El producto no tiene variantes.'; end if;
  if p.maneja_vencimiento then raise exception 'Un producto con vencimiento no puede dejar su stock sin repartir.'; end if;

  if exists (
    select 1 from wms_stock_ubicacion su join skus_maestros h on h.id = su.sku_maestro_id
    where h.padre_id = p_padre and su.cantidad <> 0
  ) then
    raise exception 'Una variante tiene stock por ubicación: no se puede dejar sin repartir.';
  end if;
  if exists (
    select 1 from wms_stock st join skus_maestros h on h.id = st.sku_maestro_id
    where h.padre_id = p_padre and (st.reservado <> 0 or st.danado <> 0 or st.inspeccion <> 0 or st.retenido <> 0)
  ) then
    raise exception 'Una variante tiene stock reservado, dañado, en inspección o retenido: resuélvelo antes de dejar el stock sin repartir.';
  end if;

  update skus_maestros set reparto_pendiente = true, reparto_pendiente_desde = coalesce(reparto_pendiente_desde, now()) where id = p_padre;

  for s in
    select st.sku_maestro_id as variante, st.bodega_id as bodega, st.fisico
    from wms_stock st
    join skus_maestros h on h.id = st.sku_maestro_id and h.padre_id = p_padre
    join wms_bodegas b on b.id = st.bodega_id and b.tipo = 'propia'
    where st.fisico <> 0
    order by h.codigo, st.bodega_id
  loop
    perform wms_registrar_movimiento(s.variante, s.bodega, 'ajuste', -s.fisico, null, 'reparto', 'Stock pasado al producto general', 'Pendiente de repartir entre las variantes', p_usuario);
    perform wms_registrar_movimiento(p_padre, s.bodega, 'ajuste', s.fisico, null, 'reparto', 'Stock de una variante pasado al producto general', 'Pendiente de repartir entre las variantes', p_usuario);
    movidas := movidas + 1;
    unidades := unidades + s.fisico;
  end loop;

  return jsonb_build_object('movidas', movidas, 'unidades', unidades);
end;
$$;

-- Reparte el stock general entre las variantes. `p_reparto` = [{"variante": uuid, "bodega": uuid, "cantidad": n}, …]. En cada bodega lo repartido tiene que ser
-- exactamente lo que el principal tiene ahí; al terminar, el principal queda sin stock general y sin la marca de pendiente.
create or replace function wms_repartir_stock_variantes(p_padre uuid, p_reparto jsonb, p_usuario uuid default null)
returns jsonb
language plpgsql
as $$
declare
  p skus_maestros%rowtype;
  fila record;
  b record;
  suma integer;
  repartidas integer := 0;
begin
  select * into p from skus_maestros where id = p_padre for update;
  if not found then raise exception 'El producto no existe.'; end if;
  if not p.reparto_pendiente then raise exception 'Este producto no tiene stock pendiente de repartir.'; end if;
  if p_reparto is null or jsonb_typeof(p_reparto) <> 'array' then raise exception 'El reparto no es válido.'; end if;

  create temporary table if not exists _reparto (variante uuid, bodega uuid, cantidad integer) on commit drop;
  delete from _reparto;
  for fila in select * from jsonb_to_recordset(p_reparto) as x(variante uuid, bodega uuid, cantidad integer) loop
    if fila.variante is null or fila.bodega is null or fila.cantidad is null or fila.cantidad < 0 then
      raise exception 'El reparto no es válido: cada línea lleva variante, bodega y una cantidad de 0 o más.';
    end if;
    if not exists (select 1 from skus_maestros where id = fila.variante and padre_id = p_padre) then
      raise exception 'Una de las variantes del reparto no es de este producto.';
    end if;
    if not exists (select 1 from wms_bodegas where id = fila.bodega and tipo = 'propia') then
      raise exception 'Una de las bodegas del reparto no existe o no es propia.';
    end if;
    insert into _reparto values (fila.variante, fila.bodega, fila.cantidad);
  end loop;

  if exists (select 1 from wms_stock where sku_maestro_id = p_padre and (reservado <> 0 or danado <> 0 or inspeccion <> 0 or retenido <> 0)) then
    raise exception 'El stock general tiene unidades reservadas, dañadas, en inspección o retenidas: resuélvelo antes de repartir.';
  end if;
  if exists (select 1 from wms_stock_ubicacion where sku_maestro_id = p_padre and cantidad <> 0) then
    raise exception 'El stock general está por ubicación: no se puede repartir desde aquí.';
  end if;

  -- Cada bodega con stock general (o mencionada en el reparto) se reparte exacta.
  for b in
    select bodega, coalesce(sum(cantidad), 0)::integer as repartido,
      coalesce((select s.fisico from wms_stock s where s.sku_maestro_id = p_padre and s.bodega_id = r.bodega), 0) as general
    from _reparto r group by bodega
    union
    select s.bodega_id, 0, s.fisico from wms_stock s where s.sku_maestro_id = p_padre and s.fisico <> 0 and not exists (select 1 from _reparto r where r.bodega = s.bodega_id)
  loop
    if b.general < 0 then
      raise exception 'El stock general de % está en negativo (%): corrígelo con un ajuste antes de repartir.', (select nombre from wms_bodegas where id = b.bodega), b.general;
    end if;
    if b.repartido <> b.general then
      raise exception 'En % hay que repartir exactamente % unidades y se repartieron %.', (select nombre from wms_bodegas where id = b.bodega), b.general, b.repartido;
    end if;
  end loop;

  for fila in select variante, bodega, cantidad from _reparto where cantidad > 0 order by bodega, variante loop
    perform wms_registrar_movimiento(p_padre, fila.bodega, 'salida', fila.cantidad, null, 'reparto', 'Reparto entre variantes', null, p_usuario);
    perform wms_registrar_movimiento(fila.variante, fila.bodega, 'entrada', fila.cantidad, null, 'reparto', 'Reparto del stock general', null, p_usuario);
    repartidas := repartidas + fila.cantidad;
  end loop;

  select coalesce(sum(abs(fisico)), 0) into suma from wms_stock where sku_maestro_id = p_padre;
  if suma <> 0 then
    raise exception 'Después de repartir al principal le quedan unidades: revisa el reparto.';
  end if;
  update skus_maestros set reparto_pendiente = false, reparto_pendiente_desde = null where id = p_padre;

  return jsonb_build_object('repartidas', repartidas);
end;
$$;

-- Solo el servidor (clave de servicio) y quien corre SQL en Supabase pueden llamarlas.
revoke all on function wms_dejar_reparto_pendiente(uuid, uuid) from public, anon, authenticated;
revoke all on function wms_repartir_stock_variantes(uuid, jsonb, uuid) from public, anon, authenticated;
