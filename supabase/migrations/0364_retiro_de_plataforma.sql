-- Retiro de plataforma (25 nov 2026, pedido de Jhokser: traer mercancía de dos plataformas y venderla; hasta hoy eran entradas a mano y el Cuadro la daba por faltante).
-- Es una remisión que sale de una plataforma y va a una bodega propia:
--   * al crearla solo queda el documento (REM-0000) «en camino»; el Cuadro ya le resta esas unidades a la plataforma;
--   * al confirmar lo que llegó, entra al inventario de la bodega propia en la misma transacción (con vencimiento pide la fecha);
--   * corregir lo recibido (con autorización) ajusta el stock por la diferencia; anular lo que sigue en camino no mueve nada.
-- Además arregla que desde la 0344 no se podía anular una remisión que sale de una plataforma («No se encontraron las N unidades de esa salida»).
-- Se puede correr más de una vez. Reversa: supabase/rollbacks/0364_rollback.sql

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
  v_sku record;
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
  -- Sale de una plataforma y va a otra o, desde 0364, a una bodega propia (un retiro: al recibirlo entra al inventario).
  if v_desde.tipo <> 'externa' or v_hacia.tipo not in ('externa', 'propia') or not v_desde.activa or not v_hacia.activa then
    raise exception 'Esta remisión sale de una plataforma y va a otra o a una bodega propia, las dos activas.';
  end if;
  if p_desde = p_hacia then raise exception 'La plataforma de origen y la de destino son la misma.'; end if;
  if v_desde.pais_id <> v_hacia.pais_id then raise exception 'El origen y el destino tienen que ser del mismo país.'; end if;

  insert into wms_remisiones (bodega_origen_id, bodega_destino_id, notas, creado_por)
  values (p_desde, p_hacia, nullif(btrim(p_notas), ''), p_usuario)
  returning id, numero into v_id, v_numero;
  v_codigo := 'REM-' || lpad(v_numero::text, 4, '0');
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item ->> 'cantidad')::integer;
    if v_cantidad is null or v_cantidad <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
    -- Un retiro entra al inventario: lo que no puede guardar stock se avisa ahora y no al recibirlo.
    if v_hacia.tipo = 'propia' then
      select codigo, tipo, clase, opciones_variantes, reparto_pendiente into v_sku from skus_maestros where id = (v_item ->> 'sku')::uuid;
      if not found then raise exception 'Un producto de la lista ya no existe.'; end if;
      if v_sku.tipo = 'combo' then raise exception '% es un compuesto y no guarda stock: retira sus componentes.', v_sku.codigo; end if;
      if v_sku.clase = 'test' then raise exception '% es un producto de prueba y todavía no tiene stock.', v_sku.codigo; end if;
      if v_sku.opciones_variantes is not null and not coalesce(v_sku.reparto_pendiente, false) then raise exception '% tiene variantes: elige cada variante.', v_sku.codigo; end if;
    end if;
    insert into wms_envios_dropi (sku_maestro_id, bodega_origen_id, bodega_dropi_id, enviada, referencia, enviado_por, remision_id)
    values ((v_item ->> 'sku')::uuid, p_desde, p_hacia, v_cantidad, v_codigo, p_usuario, v_id);
  end loop;
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

revoke all on function wms_crear_remision_plataformas(uuid, uuid, jsonb, text, uuid) from public, anon, authenticated;

-- La firma cambió (la fecha de vencimiento): se quita la anterior para que no queden dos.
drop function if exists wms_recibir_envio_dropi(uuid, integer, text, uuid);

create or replace function wms_recibir_envio_dropi(
  p_envio uuid,
  p_recibida integer,
  p_motivo text default null,
  p_usuario uuid default null,
  p_vencimiento date default null
) returns void
language plpgsql as $$
declare
  v_envio record;
  v_origen text;
  v_destino text;
  v_maneja boolean;
begin
  select * into v_envio from wms_envios_dropi where id = p_envio for update;
  if not found then raise exception 'El envío no existe.'; end if;
  if v_envio.estado <> 'en_camino' then
    raise exception 'Ese envío ya se marcó como recibido.';
  end if;
  if p_recibida is null or p_recibida < 0 then
    raise exception 'Escribe cuántas unidades llegaron.';
  end if;
  if p_recibida <> v_envio.enviada and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Llegaron % de %: escribe el motivo de la diferencia.', p_recibida, v_envio.enviada;
  end if;
  select tipo into v_origen from wms_bodegas where id = v_envio.bodega_origen_id;
  select tipo into v_destino from wms_bodegas where id = v_envio.bodega_dropi_id;
  -- Un retiro de plataforma: lo que llega entra a la bodega propia, en la misma transacción.
  if v_origen = 'externa' and v_destino = 'propia' and p_recibida > 0 then
    select maneja_vencimiento into v_maneja from skus_maestros where id = v_envio.sku_maestro_id;
    if v_maneja and p_vencimiento is null then
      raise exception 'Este producto maneja vencimiento: escribe la fecha de vencimiento de lo que llegó.';
    end if;
    perform wms_registrar_movimiento(
      v_envio.sku_maestro_id, v_envio.bodega_dropi_id, 'entrada', p_recibida, null, 'envio_dropi', v_envio.referencia, 'Retiro de plataforma', p_usuario, null,
      case when v_maneja then 'Vence ' || to_char(p_vencimiento, 'YYYY-MM-DD') end,
      case when v_maneja then p_vencimiento end
    );
  end if;
  update wms_envios_dropi
     set recibida = p_recibida, estado = 'recibido', motivo_diferencia = nullif(btrim(p_motivo), ''),
         recibido_por = p_usuario, recibido_en = now()
   where id = p_envio;
end;
$$;

revoke all on function wms_recibir_envio_dropi(uuid, integer, text, uuid, date) from public, anon, authenticated;

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
  v_origen text;
  v_destino text;
  v_diferencia integer;
  v_lote uuid;
  v_maneja boolean;
begin
  select * into c from wms_correcciones_remision where id = p_correccion for update;
  if not found then raise exception 'La petición ya no existe.'; end if;
  if c.estado <> 'pendiente' then raise exception 'Esa petición ya se resolvió.'; end if;
  if c.solicitante_id = p_usuario and not (c.directa and c.tipo = 'anular') then raise exception 'No puedes autorizar tu propia petición.'; end if;
  if not (p_usuario = any (c.autoriza_a)) then raise exception 'No puedes resolver esta petición.'; end if;
  if not p_autorizar and coalesce(btrim(p_nota), '') = '' then raise exception 'Escribe por qué la rechazas.'; end if;

  if p_autorizar then
    select * into e from wms_envios_dropi where id = c.envio_id for update;
    select tipo into v_origen from wms_bodegas where id = e.bodega_origen_id;
    select tipo into v_destino from wms_bodegas where id = e.bodega_dropi_id;
    if c.tipo = 'recibida' then
      if e.estado <> 'recibido' then raise exception 'Esa línea ya no está recibida.'; end if;
      -- En un retiro de plataforma lo recibido ya está en el inventario: se ajusta por la diferencia.
      v_diferencia := c.recibida_nueva - coalesce(e.recibida, 0);
      if v_origen = 'externa' and v_destino = 'propia' and v_diferencia <> 0 then
        select maneja_vencimiento into v_maneja from skus_maestros where id = e.sku_maestro_id;
        if v_maneja then
          select lote_id into v_lote from wms_movimientos
           where sku_maestro_id = e.sku_maestro_id and bodega_id = e.bodega_dropi_id and origen = 'envio_dropi' and tipo = 'entrada' and referencia = e.referencia
           limit 1;
          if v_lote is null then raise exception 'No hay un lote de esa recepción: ajusta el stock a mano en Inventario.'; end if;
        end if;
        perform wms_registrar_movimiento(e.sku_maestro_id, e.bodega_dropi_id, 'ajuste', v_diferencia, null, 'envio_dropi', e.referencia, 'Corrección de lo recibido: ' || c.motivo, p_usuario, v_lote);
      end if;
      update wms_envios_dropi
         set recibida = c.recibida_nueva,
             motivo_diferencia = case when c.recibida_nueva = e.enviada then null else c.motivo end
       where id = e.id;
    else
      if e.estado <> 'en_camino' then raise exception 'Esa línea ya no sigue en camino: no se puede anular.'; end if;
      -- Lo que sale de una plataforma nunca salió del stock del sistema: no hay unidades que devolver.
      if v_origen = 'propia' then
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
