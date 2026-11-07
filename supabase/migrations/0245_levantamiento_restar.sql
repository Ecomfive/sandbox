-- Levantamiento: «Restar» (pedido de Hernán, 7 nov 2026). Es el opuesto de `wms_sumar_levantamiento` (0235): cada producto sale con lo escrito, sin tocar el resto de lo que había.
-- Un producto con vencimiento sale por FEFO (primero el lote que vence antes; `wms_registrar_movimiento` lo hace solo cuando no se nombra lote). Todo o nada: si un producto falla, no sale ninguno.
-- Quién puede restar a mano (en Costa Rica solo un administrador, con motivo) se comprueba en la acción del servidor, como en la ficha de Inventario.
-- Reversa: supabase/rollbacks/0245_rollback.sql

create or replace function wms_restar_levantamiento(
  p_bodega uuid,
  p_items jsonb,
  p_referencia text default null,
  p_usuario uuid default null
) returns jsonb
language plpgsql as $$
declare
  v_bodega record;
  v_conteo uuid;
  v_item jsonb;
  v_sku uuid;
  v_clase text;
  v_tipo text;
  v_cantidad integer;
  v_motivo text;
  v_productos integer := 0;
begin
  select tipo, activa into v_bodega from wms_bodegas where id = p_bodega;
  if not found then raise exception 'La bodega no existe.'; end if;
  if v_bodega.tipo <> 'propia' or not v_bodega.activa then
    raise exception 'El levantamiento se hace en una bodega propia y activa.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay productos para restar.';
  end if;

  insert into wms_conteos (bodega_id, referencia, usuario_id) values (p_bodega, nullif(btrim(p_referencia), ''), p_usuario)
  returning id into v_conteo;
  v_motivo := 'Resta del inventario' || coalesce(' · ' || nullif(btrim(p_referencia), ''), '');

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sku := (v_item->>'sku')::uuid;
    select clase, tipo into v_clase, v_tipo from skus_maestros where id = v_sku;
    if not found then raise exception 'Un producto no existe.'; end if;
    if v_tipo = 'combo' or v_clase = 'test' then continue; end if;
    v_cantidad := (v_item->>'cantidad')::integer;
    if v_cantidad is null or v_cantidad <= 0 then raise exception 'Una cantidad para restar no es válida.'; end if;
    v_productos := v_productos + 1;
    perform wms_registrar_movimiento(v_sku, p_bodega, 'salida', v_cantidad, null, 'conteo', v_conteo::text, v_motivo, p_usuario);
  end loop;
  update wms_conteos set productos = v_productos, ajustes = v_productos where id = v_conteo;
  return jsonb_build_object('productos', v_productos, 'ajustes', v_productos);
end;
$$;
