-- Remisión entre plataformas (6 nov 2026, pedido de Hernán, flujograma de Proveeduría Costa Rica: «entre plataformas siempre es remisión, porque no son bodegas propias»). Mercancía que no se
-- mueve o se vende mejor en otra plataforma. Es un documento: REM-0000 con su papel y sus líneas en `wms_envios_dropi`. No toca `wms_stock`, porque lo que hay en una plataforma lo dice su lectura, y
-- el sistema no ejecuta nada allá: el cuadro le resta a la de origen lo que salió y le suma a la de destino lo que se confirma recibido.

create or replace function wms_crear_remision_plataformas(
  p_desde uuid,
  p_hacia uuid,
  p_items jsonb,
  p_notas text default null,
  p_usuario uuid default null
) returns jsonb
language plpgsql as $$
declare
  v_desde record;
  v_hacia record;
  v_id uuid;
  v_numero integer;
  v_codigo text;
  v_item jsonb;
  v_cantidad integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La remisión no tiene productos.';
  end if;
  if (select count(distinct x ->> 'sku') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Un producto está dos veces en la remisión.';
  end if;
  select pais_id, tipo, activa into v_desde from wms_bodegas where id = p_desde;
  if not found then raise exception 'La bodega de origen no existe.'; end if;
  select pais_id, tipo, activa into v_hacia from wms_bodegas where id = p_hacia;
  if not found then raise exception 'La bodega de destino no existe.'; end if;
  if v_desde.tipo <> 'externa' or v_hacia.tipo <> 'externa' or not v_desde.activa or not v_hacia.activa then
    raise exception 'Esta remisión va de una plataforma a otra, las dos activas.';
  end if;
  if p_desde = p_hacia then raise exception 'La plataforma de origen y la de destino son la misma.'; end if;
  if v_desde.pais_id <> v_hacia.pais_id then raise exception 'Las dos plataformas tienen que ser del mismo país.'; end if;

  insert into wms_remisiones (bodega_origen_id, bodega_destino_id, notas, creado_por)
  values (p_desde, p_hacia, nullif(btrim(p_notas), ''), p_usuario)
  returning id, numero into v_id, v_numero;
  v_codigo := 'REM-' || lpad(v_numero::text, 4, '0');
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item ->> 'cantidad')::integer;
    if v_cantidad is null or v_cantidad <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
    insert into wms_envios_dropi (sku_maestro_id, bodega_origen_id, bodega_dropi_id, enviada, referencia, enviado_por, remision_id)
    values ((v_item ->> 'sku')::uuid, p_desde, p_hacia, v_cantidad, v_codigo, p_usuario, v_id);
  end loop;
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

revoke all on function wms_crear_remision_plataformas(uuid, uuid, jsonb, text, uuid) from public, anon, authenticated;

-- Anular una línea que salió de una plataforma: no hay unidades que devolver, solo se marca anulada.
create or replace function wms_resolver_correccion_remision(
  p_correccion uuid,
  p_autorizar boolean,
  p_nota text,
  p_usuario uuid,
  p_nombre text
) returns void
language plpgsql as $$
declare
  c record;
  e record;
  m record;
  v_caja jsonb;
  v_ubicacion uuid;
  v_devueltas integer := 0;
  v_tipo_origen text;
begin
  select * into c from wms_correcciones_remision where id = p_correccion for update;
  if not found then raise exception 'La petición ya no existe.'; end if;
  if c.estado <> 'pendiente' then raise exception 'Esa petición ya se resolvió.'; end if;
  if c.solicitante_id = p_usuario then raise exception 'No puedes autorizar tu propia petición.'; end if;
  if not (p_usuario = any (c.autoriza_a)) then raise exception 'No puedes resolver esta petición.'; end if;
  if not p_autorizar and coalesce(btrim(p_nota), '') = '' then raise exception 'Escribe por qué la rechazas.'; end if;

  if p_autorizar then
    select * into e from wms_envios_dropi where id = c.envio_id for update;
    if c.tipo = 'recibida' then
      if e.estado <> 'recibido' then raise exception 'Esa línea ya no está recibida.'; end if;
      update wms_envios_dropi
         set recibida = c.recibida_nueva,
             motivo_diferencia = case when c.recibida_nueva = e.enviada then null else c.motivo end
       where id = e.id;
    else
      if e.estado <> 'en_camino' then raise exception 'Esa línea ya no sigue en camino: no se puede anular.'; end if;
      select tipo into v_tipo_origen from wms_bodegas where id = e.bodega_origen_id;
      -- Lo que sale de una plataforma nunca salió del stock del sistema: no hay unidades que devolver.
      if v_tipo_origen = 'propia' then
      for m in
        select lote_id, abs((cambios ->> 'fisico')::integer) as cantidad
          from wms_movimientos
         where sku_maestro_id = e.sku_maestro_id and bodega_id = e.bodega_origen_id and origen = 'envio_dropi' and tipo = 'salida' and referencia = e.referencia
      loop
        perform wms_registrar_movimiento(e.sku_maestro_id, e.bodega_origen_id, 'entrada', m.cantidad, null, 'envio_dropi', e.referencia, 'Remisión anulada: ' || c.motivo, p_usuario, m.lote_id);
        v_devueltas := v_devueltas + m.cantidad;
      end loop;
      if v_devueltas <> e.enviada then
        raise exception 'No se encontraron las % unidades de esa salida: revísalo antes de anular.', e.enviada;
      end if;
      end if;
      -- `to_jsonb`: si la base todavía no tiene las cajas, una línea simplemente no trae ninguna.
      for v_caja in select * from jsonb_array_elements(case when jsonb_typeof(to_jsonb(e) -> 'cajas') = 'array' then to_jsonb(e) -> 'cajas' else '[]'::jsonb end) loop
        select id into v_ubicacion from wms_ubicaciones where bodega_id = e.bodega_origen_id and codigo = v_caja ->> 'ubicacion';
        if v_ubicacion is null then raise exception 'La ubicación % ya no existe: no se pueden devolver sus cajas.', v_caja ->> 'ubicacion'; end if;
        insert into wms_cajas (bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja, cajas, actualizado_por)
        values (e.bodega_origen_id, e.sku_maestro_id, v_ubicacion, (v_caja ->> 'por_caja')::integer, (v_caja ->> 'cajas')::integer, p_usuario)
        on conflict (bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja)
        do update set cajas = wms_cajas.cajas + excluded.cajas, actualizado_por = p_usuario, actualizado_en = now();
      end loop;
      update wms_envios_dropi set estado = 'anulado' where id = e.id;
    end if;
  end if;

  update wms_correcciones_remision
     set estado = case when p_autorizar then 'autorizada' else 'rechazada' end,
         resuelta_por = p_usuario, resuelta_por_nombre = p_nombre, resuelta_en = now(), nota_resolucion = nullif(btrim(p_nota), '')
   where id = c.id;
end;
$$;

notify pgrst, 'reload schema';
