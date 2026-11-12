-- Remisión: agregar productos a una que ya existe (12 nov 2026, pedido de Hernán: «se necesitan agregar más líneas»). Hasta hoy una remisión no se podía cambiar: había que
-- anular las líneas (con autorización) y crear otra con otro número. `wms_agregar_a_remision(remisión, items, usuario)` suma líneas a la misma remisión, con el mismo número y la
-- misma referencia, así que el papel sigue siendo uno solo.
--
--   * Solo mientras la remisión **no tenga ninguna línea recibida** (después, lo recibido ya se confirmó contra el papel) y tenga al menos una línea en camino (una remisión anulada no
--     se reabre). Si no, se niega y dice que hay que crear otra.
--   * Las líneas nuevas salen igual que al crearla: de una bodega propia, `wms_enviar_a_externa` descuenta el stock y deja la línea «en camino»; de una plataforma (0242) solo queda
--     el documento. Un producto que ya está en la remisión (sin anular) no se repite: se anula esa línea o se crea otra remisión. Un producto guardado por cajas no entra por aquí.
--   * Todo o nada: si a un producto no le alcanza el stock, no se agrega ninguno. `p_items` = [{ sku, cantidad, lote? }].
-- Código: src/app/(app)/inventario/remisiones/actions.ts (agregarAremision), agregar-a-remision.tsx. Reversa: supabase/rollbacks/0274_rollback.sql

create or replace function wms_agregar_a_remision(
  p_remision uuid,
  p_items jsonb,
  p_usuario uuid default null
) returns jsonb
language plpgsql as $$
declare
  r wms_remisiones%rowtype;
  v_codigo text;
  v_tipo_origen text;
  v_item jsonb;
  v_sku uuid;
  v_sku_codigo text;
  v_cantidad integer;
  v_envio uuid;
  v_agregadas integer := 0;
  v_unidades integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay productos que agregar.';
  end if;
  if (select count(distinct x ->> 'sku') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Un producto está dos veces en la lista.';
  end if;
  select * into r from wms_remisiones where id = p_remision for update;
  if not found then raise exception 'La remisión no existe.'; end if;
  if exists (select 1 from wms_envios_dropi where remision_id = p_remision and estado = 'recibido') then
    raise exception 'Esta remisión ya tiene productos recibidos: no se le pueden agregar más. Crea otra remisión.';
  end if;
  if not exists (select 1 from wms_envios_dropi where remision_id = p_remision and estado = 'en_camino') then
    raise exception 'Esta remisión está anulada: no se le pueden agregar productos.';
  end if;
  v_codigo := 'REM-' || lpad(r.numero::text, 4, '0');
  select tipo into v_tipo_origen from wms_bodegas where id = r.bodega_origen_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sku := (v_item ->> 'sku')::uuid;
    v_cantidad := (v_item ->> 'cantidad')::integer;
    if v_cantidad is null or v_cantidad <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
    select codigo into v_sku_codigo from skus_maestros where id = v_sku;
    if not found then raise exception 'Un producto de la lista ya no existe.'; end if;
    if exists (select 1 from wms_envios_dropi where remision_id = p_remision and sku_maestro_id = v_sku and estado <> 'anulado') then
      raise exception '% ya está en la remisión.', v_sku_codigo;
    end if;
    if exists (select 1 from wms_cajas where bodega_id = r.bodega_origen_id and sku_maestro_id = v_sku and cajas > 0) then
      raise exception '% está guardado por cajas: mándalo en una remisión nueva.', v_sku_codigo;
    end if;
    if v_tipo_origen = 'propia' then
      v_envio := wms_enviar_a_externa(v_sku, r.bodega_origen_id, r.bodega_destino_id, v_cantidad, nullif(v_item ->> 'lote', '')::uuid, v_codigo, p_usuario);
      update wms_envios_dropi set remision_id = p_remision where id = v_envio;
    else
      insert into wms_envios_dropi (sku_maestro_id, bodega_origen_id, bodega_dropi_id, enviada, referencia, enviado_por, remision_id)
      values (v_sku, r.bodega_origen_id, r.bodega_destino_id, v_cantidad, v_codigo, p_usuario, p_remision);
    end if;
    v_agregadas := v_agregadas + 1;
    v_unidades := v_unidades + v_cantidad;
  end loop;
  return jsonb_build_object('numero', r.numero, 'agregadas', v_agregadas, 'unidades', v_unidades);
end;
$$;

-- Solo el servidor (clave de servicio) y quien corre SQL en Supabase pueden llamarla.
revoke all on function wms_agregar_a_remision(uuid, jsonb, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
