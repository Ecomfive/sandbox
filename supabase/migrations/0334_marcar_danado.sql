-- Productos defectuosos (19 nov 2026, pedido de Dinora vía Jhokser: poder marcar unidades como defectuosas en vez de solo restarlas). Un defectuoso sigue en la bodega pero no se vende: es la cubeta
-- «dañado» (`wms_stock.danado`), que ya resta del disponible y se ve en «Fuera de venta». Hasta ahora solo se llegaba a ella moviendo unidades a una ubicación de propiedad «dañado»; esta función
-- lo hace desde la ficha del producto, sobre una bodega propia, con motivo, y deja el movimiento en el libro:
--   * 'marcar':   danado + n (el físico no cambia, el disponible baja). Solo hasta lo disponible.
--   * 'devolver': danado − n (vuelven a disponible). Solo hasta lo defectuoso.
--   * 'baja':     fisico − n y danado − n (salen del inventario). Solo hasta lo defectuoso; es una salida.
-- No sirve para un producto con vencimiento (los lotes): ahí se usa una salida o un ajuste por lote. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0334_rollback.sql

create or replace function wms_marcar_danado(
  p_sku uuid,
  p_bodega uuid,
  p_accion text,
  p_cantidad integer,
  p_motivo text,
  p_usuario uuid default null
) returns uuid
language plpgsql as $$
declare
  v_tipo_bodega text;
  v_maneja boolean;
  v_tipo text;
  s wms_stock%rowtype;
  v_cambios jsonb;
  v_referencia text;
  v_id uuid;
begin
  if p_accion not in ('marcar', 'devolver', 'baja') then
    raise exception 'Acción no válida: %.', p_accion;
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo.';
  end if;

  select tipo into v_tipo_bodega from wms_bodegas where id = p_bodega;
  if not found then
    raise exception 'La bodega no existe.';
  end if;
  if v_tipo_bodega <> 'propia' then
    raise exception 'Esta bodega es externa: su stock solo lo cambia la sincronización.';
  end if;

  select maneja_vencimiento, tipo into v_maneja, v_tipo from skus_maestros where id = p_sku;
  if not found then
    raise exception 'El SKU maestro no existe.';
  end if;
  if v_tipo = 'combo' then
    raise exception 'Un producto compuesto no guarda stock.';
  end if;
  if v_maneja then
    raise exception 'Este producto maneja vencimiento: márcalo con una salida o un ajuste por lote.';
  end if;

  select * into s from wms_stock where sku_maestro_id = p_sku and bodega_id = p_bodega for update;
  if not found then
    s.disponible := 0;
    s.danado := 0;
  end if;

  if p_accion = 'marcar' then
    if p_cantidad > greatest(s.disponible, 0) then
      raise exception 'Solo hay % unidades disponibles en esa bodega.', greatest(s.disponible, 0);
    end if;
    v_cambios := jsonb_build_object('danado', p_cantidad);
    v_referencia := 'Defectuoso';
  else
    if p_cantidad > greatest(s.danado, 0) then
      raise exception 'Solo hay % unidades defectuosas en esa bodega.', greatest(s.danado, 0);
    end if;
    if p_accion = 'devolver' then
      v_cambios := jsonb_build_object('danado', -p_cantidad);
      v_referencia := 'Defectuoso: vuelve a disponible';
    else
      v_cambios := jsonb_build_object('fisico', -p_cantidad, 'danado', -p_cantidad);
      v_referencia := 'Defectuoso: baja';
    end if;
  end if;

  perform wms_aplicar_cambios(p_sku, p_bodega, v_cambios);

  insert into wms_movimientos (sku_maestro_id, bodega_id, tipo, cambios, origen, referencia, motivo, usuario_id)
  values (p_sku, p_bodega, case when p_accion = 'baja' then 'salida' else 'ajuste' end, v_cambios, 'manual', v_referencia, btrim(p_motivo), p_usuario)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function wms_marcar_danado(uuid, uuid, text, integer, text, uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
