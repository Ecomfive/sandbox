-- El traslado también mueve las cajas (pedido de Hernán, 7 nov 2026): un producto guardado por cajas se traslada eligiendo cuáles, igual que en la remisión, y salen de su ubicación. Si la bodega
-- de destino tiene ubicaciones, entran a la que se elija; si no tiene, llegan como unidades y ahí no se llevan por caja. `wms_traslado_items.cajas` guarda qué cajas se movieron y a dónde.
-- Reversa: supabase/rollbacks/0238_rollback.sql

alter table wms_traslado_items add column if not exists cajas jsonb;

-- `p_items` = [{ sku, cantidad, lote?, cajas?: [{ id, cajas }], ubicacion_destino? }]. Todo el traslado o nada.
create or replace function wms_crear_traslado(
  p_desde uuid,
  p_hacia uuid,
  p_items jsonb,
  p_notas text default null,
  p_usuario uuid default null,
  p_nombre text default null
) returns jsonb
language plpgsql as $$
declare
  v_id uuid;
  v_numero integer;
  v_codigo text;
  v_item jsonb;
  v_elegida jsonb;
  v_sku uuid;
  v_sku_codigo text;
  v_cantidad integer;
  v_pide integer;
  v_caja record;
  v_suma integer;
  v_detalle jsonb;
  v_destino_tiene boolean;
  v_ubicacion uuid;
  v_ubicacion_codigo text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El traslado no tiene productos.';
  end if;
  if (select count(distinct x ->> 'sku') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Un producto está dos veces en el traslado.';
  end if;
  v_destino_tiene := exists (select 1 from wms_ubicaciones where bodega_id = p_hacia and activa);
  insert into wms_traslados (bodega_origen_id, bodega_destino_id, notas, creado_por, creado_por_nombre)
  values (p_desde, p_hacia, nullif(btrim(p_notas), ''), p_usuario, p_nombre)
  returning id, numero into v_id, v_numero;
  v_codigo := 'TRA-' || lpad(v_numero::text, 4, '0');
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sku := (v_item ->> 'sku')::uuid;
    v_cantidad := (v_item ->> 'cantidad')::integer;
    select codigo into v_sku_codigo from skus_maestros where id = v_sku;
    v_suma := 0;
    v_detalle := '[]'::jsonb;
    v_ubicacion := null;
    v_ubicacion_codigo := null;
    if jsonb_array_length(coalesce(v_item -> 'cajas', '[]'::jsonb)) > 0 and v_destino_tiene then
      v_ubicacion := nullif(v_item ->> 'ubicacion_destino', '')::uuid;
      if v_ubicacion is null then raise exception 'Elige en qué ubicación del destino quedan las cajas de %.', v_sku_codigo; end if;
      select codigo into v_ubicacion_codigo from wms_ubicaciones where id = v_ubicacion and bodega_id = p_hacia and activa;
      if v_ubicacion_codigo is null then raise exception 'La ubicación de % no es de la bodega de destino.', v_sku_codigo; end if;
    end if;
    for v_elegida in select * from jsonb_array_elements(coalesce(v_item -> 'cajas', '[]'::jsonb)) loop
      v_pide := (v_elegida ->> 'cajas')::integer;
      select c.id, c.cajas, c.unidades_por_caja, c.observacion, u.codigo into v_caja
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
      if v_ubicacion is not null then
        insert into wms_cajas (bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja, cajas, observacion, actualizado_por)
        values (p_hacia, v_sku, v_ubicacion, v_caja.unidades_por_caja, v_pide, v_caja.observacion, p_usuario)
        on conflict (bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja)
        do update set cajas = wms_cajas.cajas + excluded.cajas, actualizado_por = p_usuario, actualizado_en = now();
      end if;
      v_suma := v_suma + v_pide * v_caja.unidades_por_caja;
      v_detalle := v_detalle || jsonb_build_object('ubicacion', v_caja.codigo, 'cajas', v_pide, 'por_caja', v_caja.unidades_por_caja, 'destino', v_ubicacion_codigo);
    end loop;
    if jsonb_array_length(v_detalle) > 0 then
      if v_suma <> v_cantidad then raise exception 'Las cajas de % suman % unidades, no %.', v_sku_codigo, v_suma, v_cantidad; end if;
    elsif exists (select 1 from wms_cajas where bodega_id = p_desde and sku_maestro_id = v_sku) then
      raise exception '% está guardado por cajas: elige las cajas en «Nuevo traslado».', v_sku_codigo;
    end if;
    perform wms_transferir(v_sku, p_desde, p_hacia, v_cantidad, nullif(v_item ->> 'lote', '')::uuid, v_codigo, null, p_usuario);
    insert into wms_traslado_items (traslado_id, sku_maestro_id, cantidad, cajas)
    values (v_id, v_sku, v_cantidad, case when jsonb_array_length(v_detalle) > 0 then v_detalle end);
  end loop;
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;
