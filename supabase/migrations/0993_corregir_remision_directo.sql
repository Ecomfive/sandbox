-- 0993 · Corregir lo recibido en una remisión sin autorización (27 nov 2026, pedido de Hernán: Yanixia, Costa Rica).
-- Nuevo módulo `corregir-remision`, por persona (Usuarios y roles › Permisos propios). Quien lo tiene corrige lo recibido al instante: la petición se guarda
-- «directa» y se resuelve con la misma función, que ahora deja que quien pidió una petición directa la resuelva (antes solo las anulaciones).
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0993_rollback.sql

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
  if c.solicitante_id = p_usuario and not c.directa then raise exception 'No puedes autorizar tu propia petición.'; end if;
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

insert into permisos_persona (perfil_id, modulo, nivel)
select id, 'corregir-remision', 'edicion' from perfiles
where nombre ilike 'Yanixia%' and activo
on conflict (perfil_id, modulo) do nothing;

-- Revisión: debe decir «sí» en las dos columnas.
select
  case when position('not c.directa then' in pg_get_functiondef('wms_resolver_correccion_remision(uuid, boolean, text, uuid, text)'::regprocedure)) > 0 then 'sí' else 'no' end as funcion_lista,
  case when exists (select 1 from permisos_persona pp join perfiles p on p.id = pp.perfil_id where pp.modulo = 'corregir-remision' and p.nombre ilike 'Yanixia%') then 'sí' else 'no' end as yanixia_tiene_permiso;
