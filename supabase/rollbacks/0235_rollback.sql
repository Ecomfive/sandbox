-- Reversa de 0235: quita las cajas y deja la remisión como en 0233. Las ubicaciones de la Oficina de Costa Rica se quedan (no molestan y pueden tener movimientos).
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
  v_envio uuid;
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
    v_envio := wms_enviar_a_externa(
      (v_item ->> 'sku')::uuid, p_desde, p_hacia, (v_item ->> 'cantidad')::integer, nullif(v_item ->> 'lote', '')::uuid, v_codigo, p_usuario
    );
    update wms_envios_dropi set remision_id = v_id where id = v_envio;
  end loop;
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

drop function if exists wms_registrar_conteo_cajas(uuid, jsonb, jsonb, text, uuid);
drop function if exists wms_guardar_cajas(uuid, jsonb, uuid);
alter table wms_envios_dropi drop column if exists cajas;
drop table if exists wms_cajas;
