-- Inventario › Defectuosos (27 nov 2026, pedido de Hernán): transferir unidades dañadas de una bodega a otra. El traslado de siempre mueve lo disponible; este mueve la cubeta «dañado»:
-- en la bodega de origen salen del físico y de lo dañado, y en la de destino entran al físico como dañadas (siguen sin venderse). Las dos bodegas tienen que ser propias y del mismo país. Deja dos
-- movimientos en el libro (salida y entrada, origen «transferencia») con el motivo. No sirve para un producto con vencimiento (sus lotes se mueven con un traslado por lote).
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0372_rollback.sql

create or replace function wms_transferir_danado(
  p_sku uuid,
  p_desde uuid,
  p_hacia uuid,
  p_cantidad integer,
  p_motivo text,
  p_usuario uuid default null
) returns void
language plpgsql as $$
declare
  d record;
  h record;
  v_maneja boolean;
  v_tipo text;
  v_danado integer;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_desde = p_hacia then
    raise exception 'La bodega de origen y la de destino son la misma.';
  end if;
  select id, nombre, tipo, pais_id into d from wms_bodegas where id = p_desde;
  select id, nombre, tipo, pais_id into h from wms_bodegas where id = p_hacia;
  if d.id is null or h.id is null then
    raise exception 'Una de las bodegas no existe.';
  end if;
  if d.tipo <> 'propia' or h.tipo <> 'propia' then
    raise exception 'Las dos bodegas tienen que ser propias: el stock de una externa solo lo cambia la sincronización.';
  end if;
  if d.pais_id is distinct from h.pais_id then
    raise exception 'Las dos bodegas tienen que ser del mismo país.';
  end if;
  select maneja_vencimiento, tipo into v_maneja, v_tipo from skus_maestros where id = p_sku;
  if not found then
    raise exception 'El SKU maestro no existe.';
  end if;
  if v_tipo = 'combo' then
    raise exception 'Un producto compuesto no guarda stock.';
  end if;
  if v_maneja then
    raise exception 'Este producto maneja vencimiento: sus lotes se mueven con un traslado por lote.';
  end if;

  select danado into v_danado from wms_stock where sku_maestro_id = p_sku and bodega_id = p_desde for update;
  if p_cantidad > greatest(coalesce(v_danado, 0), 0) then
    raise exception 'En % solo hay % unidades dañadas.', d.nombre, greatest(coalesce(v_danado, 0), 0);
  end if;

  perform wms_aplicar_cambios(p_sku, p_desde, jsonb_build_object('fisico', -p_cantidad, 'danado', -p_cantidad));
  perform wms_aplicar_cambios(p_sku, p_hacia, jsonb_build_object('fisico', p_cantidad, 'danado', p_cantidad));

  insert into wms_movimientos (sku_maestro_id, bodega_id, tipo, cambios, origen, referencia, motivo, usuario_id)
  values
    (p_sku, p_desde, 'salida', jsonb_build_object('fisico', -p_cantidad, 'danado', -p_cantidad), 'transferencia', 'Defectuoso: traslado a ' || h.nombre, v_motivo, p_usuario),
    (p_sku, p_hacia, 'entrada', jsonb_build_object('fisico', p_cantidad, 'danado', p_cantidad), 'transferencia', 'Defectuoso: traslado desde ' || d.nombre, v_motivo, p_usuario);
end;
$$;

revoke all on function wms_transferir_danado(uuid, uuid, uuid, integer, text, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Revisión: debe decir «transferir dañado listo».
select case when exists (select 1 from pg_proc where proname = 'wms_transferir_danado') then 'transferir dañado listo' else 'FALTA la función' end as revision;
