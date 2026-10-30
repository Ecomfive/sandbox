-- Reversa de 0203_whatsapp_chat_interno_salas.sql: vuelve la función de la 0202 (chat entre dos números, solo texto). Los chats que la 0203 pasó a salas
-- (telefono interno:<sala>:<área>) no se devuelven a su número: se quedan como salas y, sin la función nueva, no se podrá escribir en ellos.
drop function if exists whatsapp_enviar_interno(uuid, text, uuid, text, text, text, text, text);

create or replace function whatsapp_enviar_interno(p_conversacion uuid, p_texto text, p_autor_id uuid, p_autor_nombre text)
returns table (o_mensaje uuid, o_momento timestamptz, o_espejo uuid)
language plpgsql
as $$
declare
  v_origen whatsapp_conversaciones%rowtype;
  v_desde whatsapp_numeros%rowtype;
  v_hacia whatsapp_numeros%rowtype;
  v_espejo uuid;
  v_mensaje uuid;
  v_ahora timestamptz := now();
  v_texto text := left(btrim(coalesce(p_texto, '')), 4096);
begin
  if v_texto = '' then
    raise exception 'mensaje_vacio';
  end if;
  select * into v_origen from whatsapp_conversaciones where id = p_conversacion;
  if not found then
    raise exception 'conversacion_no_existe';
  end if;
  select * into v_desde from whatsapp_numeros where id = v_origen.numero_id;
  -- Es interno si el teléfono del chat es otro número de la empresa.
  select * into v_hacia
    from whatsapp_numeros
   where activo
     and id <> v_origen.numero_id
     and regexp_replace(numero, '\D', '', 'g') = regexp_replace(v_origen.telefono, '\D', '', 'g')
   limit 1;
  if not found then
    raise exception 'no_es_chat_interno';
  end if;

  -- La conversación del otro lado (su número con el nuestro).
  select id into v_espejo
    from whatsapp_conversaciones
   where numero_id = v_hacia.id
     and regexp_replace(telefono, '\D', '', 'g') = regexp_replace(v_desde.numero, '\D', '', 'g')
   limit 1;
  if v_espejo is null then
    insert into whatsapp_conversaciones (numero_id, telefono, area, nombre_perfil, estado)
    values (v_hacia.id, '+' || regexp_replace(v_desde.numero, '\D', '', 'g'), v_hacia.area, v_desde.nombre, 'resuelta')
    returning id into v_espejo;
  end if;

  insert into whatsapp_mensajes (conversacion_id, direccion, tipo, texto, estado, autor_id, autor_nombre, momento)
  values (p_conversacion, 'nota', 'texto', v_texto, 'enviado', p_autor_id, p_autor_nombre, v_ahora)
  returning id into v_mensaje;
  insert into whatsapp_mensajes (conversacion_id, direccion, tipo, texto, estado, autor_id, autor_nombre, momento)
  values (v_espejo, 'nota', 'texto', v_texto, 'enviado', p_autor_id, p_autor_nombre, v_ahora);

  update whatsapp_conversaciones
     set ultimo_mensaje_en = v_ahora, ultimo_texto = left(v_texto, 160), ultimo_de = 'nota'
   where id = p_conversacion;
  update whatsapp_conversaciones
     set ultimo_mensaje_en = v_ahora, ultimo_texto = left(v_texto, 160), ultimo_de = 'nota',
         no_leidos = coalesce(no_leidos, 0) + 1, estado = 'abierta'
   where id = v_espejo;

  return query select v_mensaje, v_ahora, v_espejo;
end;
$$;
