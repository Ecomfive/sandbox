-- Reversa de 0248_remision_abrir_caja.sql: wms_crear_remision vuelve a la versión de 0236 (solo cajas enteras). Las cajas ya abiertas quedan como están.

create or replace function wms_crear_remision(
  p_desde uuid,
  p_hacia uuid,
  p_items jsonb,
  p_notas text default null,
  p_usuario uuid default null
) returns jsonb
language plpgsql as $$
declare
  v_id uuid;
  v_numero integer;
  v_codigo text;
  v_item jsonb;
  v_elegida jsonb;
  v_envio uuid;
  v_sku uuid;
  v_sku_codigo text;
  v_cantidad integer;
  v_pide integer;
  v_caja record;
  v_suma integer;
  v_detalle jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La remisión no tiene productos.';
  end if;
  if (select count(distinct x ->> 'sku') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Un producto está dos veces en la remisión.';
  end if;
  insert into wms_remisiones (bodega_origen_id, bodega_destino_id, notas, creado_por)
  values (p_desde, p_hacia, nullif(btrim(p_notas), ''), p_usuario)
  returning id, numero into v_id, v_numero;
  v_codigo := 'REM-' || lpad(v_numero::text, 4, '0');
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sku := (v_item ->> 'sku')::uuid;
    v_cantidad := (v_item ->> 'cantidad')::integer;
    select codigo into v_sku_codigo from skus_maestros where id = v_sku;
    v_suma := 0;
    v_detalle := '[]'::jsonb;
    for v_elegida in select * from jsonb_array_elements(coalesce(v_item -> 'cajas', '[]'::jsonb)) loop
      v_pide := (v_elegida ->> 'cajas')::integer;
      select c.id, c.cajas, c.unidades_por_caja, u.codigo into v_caja
      from wms_cajas c join wms_ubicaciones u on u.id = c.ubicacion_id
      where c.id = (v_elegida ->> 'id')::uuid and c.bodega_id = p_desde and c.sku_maestro_id = v_sku
      for update of c;
      if not found then raise exception 'Las cajas de % cambiaron: vuelve a elegirlas.', v_sku_codigo; end if;
      if v_pide is null or v_pide <= 0 or v_pide > v_caja.cajas then
        raise exception 'De % solo quedan % cajas de % en %.', v_sku_codigo, v_caja.cajas, v_caja.unidades_por_caja, v_caja.codigo;
      end if;
      if v_pide = v_caja.cajas then
        delete from wms_cajas where id = v_caja.id;
      else
        update wms_cajas set cajas = cajas - v_pide, actualizado_por = p_usuario, actualizado_en = now() where id = v_caja.id;
      end if;
      v_suma := v_suma + v_pide * v_caja.unidades_por_caja;
      v_detalle := v_detalle || jsonb_build_object('ubicacion', v_caja.codigo, 'cajas', v_pide, 'por_caja', v_caja.unidades_por_caja);
    end loop;
    if jsonb_array_length(v_detalle) > 0 then
      if v_suma <> v_cantidad then raise exception 'Las cajas de % suman % unidades, no %.', v_sku_codigo, v_suma, v_cantidad; end if;
    elsif exists (select 1 from wms_cajas where bodega_id = p_desde and sku_maestro_id = v_sku) then
      raise exception '% está guardado por cajas: elige las cajas en «Nueva remisión».', v_sku_codigo;
    end if;
    v_envio := wms_enviar_a_externa(v_sku, p_desde, p_hacia, v_cantidad, nullif(v_item ->> 'lote', '')::uuid, v_codigo, p_usuario);
    update wms_envios_dropi
       set remision_id = v_id, cajas = case when jsonb_array_length(v_detalle) > 0 then v_detalle end
     where id = v_envio;
  end loop;
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;
