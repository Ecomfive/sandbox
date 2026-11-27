-- Anular una línea de remisión sin pedir autorización (20 nov 2026, pedido de Hernán: la persona encargada de las remisiones, Gilexi, no podía anular la que quedó mal
-- porque la petición esperaba a otra persona). Se crea el módulo `anular-remision`, que se da **por persona** (`permisos_persona`, Usuarios y roles › Permisos propios) y solo
-- permite anular lo que sigue en camino: la petición queda guardada y resuelta al instante, con su motivo y su nombre, como cualquier anulación (las unidades vuelven a la
-- bodega, mismo lote y cajas). Corregir lo recibido sigue pidiendo autorización. `wms_correcciones_remision.directa` marca esas anulaciones: solo en ellas quien pide puede
-- resolver. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0344_rollback.sql
alter table wms_correcciones_remision add column if not exists directa boolean not null default false;

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
begin
  select * into c from wms_correcciones_remision where id = p_correccion for update;
  if not found then raise exception 'La petición ya no existe.'; end if;
  if c.estado <> 'pendiente' then raise exception 'Esa petición ya se resolvió.'; end if;
  if c.solicitante_id = p_usuario and not (c.directa and c.tipo = 'anular') then raise exception 'No puedes autorizar tu propia petición.'; end if;
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

-- A quien lleva las remisiones. Se da o se quita a otra persona en Usuarios y roles › Permisos propios.
insert into permisos_persona (perfil_id, modulo, nivel)
select id, 'anular-remision', 'edicion' from perfiles
where (nombre ilike 'Gilexi%' or nombre ilike 'Yanixia%') and activo
on conflict (perfil_id, modulo) do nothing;
