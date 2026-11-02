-- Una reacción del cliente (un 👍 con emoji) ya no reabre un chat resuelto (30 oct 2026, pedido de Alcides).
--
-- El equipo marca un chat «Resuelta» cuando ya le dio solución al cliente, y un mensaje nuevo del cliente lo vuelve a
-- dejar pendiente. Pero muchas veces el cliente solo reacciona con un emoji al «listo», y eso también lo reabría.
-- Ahora, si lo que llega es una reacción (`p_tipo = 'reaccion'`) y el chat está resuelto, se guarda la reacción (se ve
-- sobre el mensaje) sin cambiar el estado ni sumar un no leído. En un chat abierto, una reacción cuenta como antes.
--
-- Redefine `whatsapp_registrar_entrante` (migración 0158) con la misma firma: solo cambia el update del final.
-- Se puede correr dos veces. Reversa: supabase/rollbacks/0199_rollback.sql.

create or replace function whatsapp_registrar_entrante(
  p_phone_number_id text,
  p_numero text,
  p_telefono text,
  p_nombre_perfil text,
  p_dropshipper_id uuid,
  p_wa_id text,
  p_tipo text,
  p_texto text,
  p_media_id text,
  p_media_mime text,
  p_media_nombre text,
  p_momento timestamptz,
  p_resumen text
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_numero uuid;
  v_conversacion uuid;
  v_nuevo uuid;
begin
  insert into whatsapp_numeros (phone_number_id, numero, nombre)
  values (p_phone_number_id, coalesce(p_numero, p_phone_number_id), 'WhatsApp ' || coalesce(p_numero, ''))
  on conflict (phone_number_id) do nothing;
  select id into v_numero from whatsapp_numeros where phone_number_id = p_phone_number_id;

  insert into whatsapp_conversaciones (numero_id, telefono, nombre_perfil, dropshipper_id)
  values (v_numero, p_telefono, p_nombre_perfil, p_dropshipper_id)
  on conflict (numero_id, telefono) do update
    set nombre_perfil = coalesce(excluded.nombre_perfil, whatsapp_conversaciones.nombre_perfil),
        dropshipper_id = coalesce(whatsapp_conversaciones.dropshipper_id, excluded.dropshipper_id)
  returning id into v_conversacion;

  insert into whatsapp_mensajes (conversacion_id, direccion, tipo, texto, media_id, media_mime, media_nombre, wa_id, estado, momento)
  values (v_conversacion, 'entrante', p_tipo, p_texto, p_media_id, p_media_mime, p_media_nombre, p_wa_id, 'recibido', p_momento)
  on conflict (wa_id) do nothing
  returning id into v_nuevo;

  if v_nuevo is not null then
    update whatsapp_conversaciones
      -- Una reacción a un chat resuelto no lo reabre ni suma un no leído; todo lo demás, sí.
      set no_leidos = case when p_tipo = 'reaccion' and estado = 'resuelta' then no_leidos else no_leidos + 1 end,
          estado = case when p_tipo = 'reaccion' and estado = 'resuelta' then estado else 'abierta' end,
          ultimo_entrante_en = greatest(coalesce(ultimo_entrante_en, p_momento), p_momento),
          ultimo_mensaje_en = greatest(coalesce(ultimo_mensaje_en, p_momento), p_momento),
          ultimo_texto = case when ultimo_mensaje_en is null or p_momento >= ultimo_mensaje_en then p_resumen else ultimo_texto end,
          ultimo_de = case when ultimo_mensaje_en is null or p_momento >= ultimo_mensaje_en then 'entrante' else ultimo_de end
      where id = v_conversacion;
  end if;
  return v_conversacion;
end;
$$;
revoke all on function whatsapp_registrar_entrante(text, text, text, text, uuid, text, text, text, text, text, text, timestamptz, text) from public, anon, authenticated;
