-- Remisión: abrir una caja (7 nov 2026, pedido de Hernán: «se van 4 cajas de 48 y de la caja de 29 se van 8 unidades»). Cada caja elegida puede llevar, además de cajas
-- enteras, unidades sueltas de UNA caja más de ese grupo: esa caja se abre y lo que queda en ella pasa a ser una caja de lo que sobra, en el mismo lugar (de 29, salen 8 y
-- queda 1 caja de 21). Así las cajas siguen sumando el stock físico. `p_items` = [{ sku, cantidad, lote?, cajas?: [{ id, cajas, sueltas? }] }].
-- Lo que salió queda en `wms_envios_dropi.cajas` con `sueltas` (y `queda`) para la ficha y el papel. Se puede correr más de una vez.
-- Reversa: supabase/rollbacks/0248_rollback.sql (vuelve a la versión de 0236, sin unidades sueltas).

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
  v_sueltas integer;
  v_salen integer;
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
      v_pide := coalesce((v_elegida ->> 'cajas')::integer, 0);
      v_sueltas := coalesce((v_elegida ->> 'sueltas')::integer, 0);
      select c.id, c.cajas, c.unidades_por_caja, c.ubicacion_id, u.codigo into v_caja
      from wms_cajas c join wms_ubicaciones u on u.id = c.ubicacion_id
      where c.id = (v_elegida ->> 'id')::uuid and c.bodega_id = p_desde and c.sku_maestro_id = v_sku
      for update of c;
      if not found then raise exception 'Las cajas de % cambiaron: vuelve a elegirlas.', v_sku_codigo; end if;
      if v_sueltas < 0 or v_sueltas >= v_caja.unidades_por_caja then
        raise exception 'De una caja de % de % solo se pueden sacar entre 1 y % unidades sueltas.', v_caja.unidades_por_caja, v_sku_codigo, v_caja.unidades_por_caja - 1;
      end if;
      -- Las cajas que se tocan: las enteras y, si hay sueltas, la que se abre.
      v_salen := v_pide + case when v_sueltas > 0 then 1 else 0 end;
      if v_pide < 0 or v_salen = 0 or v_salen > v_caja.cajas then
        raise exception 'De % hay % de % en %: no alcanza para %.', v_sku_codigo,
          case when v_caja.cajas = 1 then '1 caja' else v_caja.cajas || ' cajas' end, v_caja.unidades_por_caja, v_caja.codigo,
          case when v_sueltas > 0 then 'abrir otra después de las enteras' else v_pide || ' enteras' end;
      end if;
      if v_salen = v_caja.cajas then
        delete from wms_cajas where id = v_caja.id;
      else
        update wms_cajas set cajas = cajas - v_salen, actualizado_por = p_usuario, actualizado_en = now() where id = v_caja.id;
      end if;
      -- Lo que queda en la caja abierta vuelve como una caja de ese tamaño, en el mismo lugar.
      if v_sueltas > 0 then
        insert into wms_cajas (bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja, cajas, actualizado_por)
        values (p_desde, v_sku, v_caja.ubicacion_id, v_caja.unidades_por_caja - v_sueltas, 1, p_usuario)
        on conflict (bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja)
        do update set cajas = wms_cajas.cajas + 1, actualizado_por = excluded.actualizado_por, actualizado_en = now();
      end if;
      v_suma := v_suma + v_pide * v_caja.unidades_por_caja + v_sueltas;
      v_detalle := v_detalle || (jsonb_build_object('ubicacion', v_caja.codigo, 'cajas', v_pide, 'por_caja', v_caja.unidades_por_caja)
        || case when v_sueltas > 0 then jsonb_build_object('sueltas', v_sueltas, 'queda', v_caja.unidades_por_caja - v_sueltas) else '{}'::jsonb end);
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

notify pgrst, 'reload schema';
