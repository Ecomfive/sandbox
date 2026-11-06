-- Reversa de 0238_traslado_cajas.sql: el traslado vuelve a mover solo unidades. Las cajas ya movidas se quedan donde están.

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
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El traslado no tiene productos.';
  end if;
  if (select count(distinct x ->> 'sku') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Un producto está dos veces en el traslado.';
  end if;
  insert into wms_traslados (bodega_origen_id, bodega_destino_id, notas, creado_por, creado_por_nombre)
  values (p_desde, p_hacia, nullif(btrim(p_notas), ''), p_usuario, p_nombre)
  returning id, numero into v_id, v_numero;
  v_codigo := 'TRA-' || lpad(v_numero::text, 4, '0');
  for v_item in select * from jsonb_array_elements(p_items) loop
    perform wms_transferir(
      (v_item ->> 'sku')::uuid, p_desde, p_hacia, (v_item ->> 'cantidad')::integer, nullif(v_item ->> 'lote', '')::uuid, v_codigo, null, p_usuario
    );
    insert into wms_traslado_items (traslado_id, sku_maestro_id, cantidad) values (v_id, (v_item ->> 'sku')::uuid, (v_item ->> 'cantidad')::integer);
  end loop;
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

alter table wms_traslado_items drop column if exists cajas;
