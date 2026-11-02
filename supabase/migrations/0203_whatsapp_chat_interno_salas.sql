-- Chat interno por salas de áreas, con fotos y audios (30 oct 2026, pedido de Jhokser).
--
-- La 0202 guardaba el chat interno como notas entre dos números de la empresa. Ahora cada persona elige con qué área habla —Atención, Comercial o Dirección— o con todas
-- a la vez, y el chat ya no depende de los números (Dirección puede no tener uno). Una SALA es un chat entre áreas: ac, ad, cd (de dos) o acd (las tres). Cada área
-- ve su propia copia de la sala: una conversación de la bandeja con el «teléfono» interno:<sala>:<área>, que no es un teléfono de verdad (nada sale a WhatsApp).
--
-- 1) Se cambia la función whatsapp_enviar_interno: ahora acepta fotos y audios (tipo, media_id, media_mime, media_nombre) y, además de las salas, sigue entendiendo el
--    chat entre dos números de la 0202.
-- 2) Los chats entre números que ya existen pasan a ser su sala de dos áreas, con su historial.
-- Solo funciones y datos: sin columnas nuevas. El servidor la llama con la clave de servicio (RLS sin políticas).

drop function if exists whatsapp_enviar_interno(uuid, text, uuid, text);

create or replace function whatsapp_enviar_interno(
  p_conversacion uuid,
  p_texto text,
  p_autor_id uuid,
  p_autor_nombre text,
  p_tipo text default 'texto',
  p_media_id text default null,
  p_media_mime text default null,
  p_media_nombre text default null
)
returns table (o_mensaje uuid, o_momento timestamptz, o_espejo uuid)
language plpgsql
as $$
declare
  v_origen whatsapp_conversaciones%rowtype;
  v_desde whatsapp_numeros%rowtype;
  v_hacia whatsapp_numeros%rowtype;
  v_sala text;
  v_area_origen text;
  v_areas text[];
  v_area text;
  v_copia uuid;
  v_espejo uuid;
  v_mensaje uuid;
  v_id uuid;
  v_ahora timestamptz := now();
  v_texto text := left(btrim(coalesce(p_texto, '')), 4096);
  v_resumen text;
begin
  if p_tipo not in ('texto', 'imagen', 'audio') then
    raise exception 'tipo_no_valido';
  end if;
  if p_tipo <> 'texto' and (p_media_id is null or p_media_id = '') then
    raise exception 'falta_archivo';
  end if;
  if v_texto = '' and p_tipo = 'texto' then
    raise exception 'mensaje_vacio';
  end if;
  v_resumen := case
    when v_texto <> '' then left(v_texto, 160)
    when p_tipo = 'imagen' then 'Foto'
    when p_tipo = 'audio' then 'Audio'
    else ''
  end;

  select * into v_origen from whatsapp_conversaciones where id = p_conversacion;
  if not found then
    raise exception 'conversacion_no_existe';
  end if;

  if v_origen.telefono like 'interno:%' then
    -- ===== Una sala: el mensaje va a la copia de cada área de la sala =====
    v_sala := split_part(v_origen.telefono, ':', 2);
    v_area_origen := split_part(v_origen.telefono, ':', 3);
    if v_sala not in ('ac', 'ad', 'cd', 'acd') then
      raise exception 'sala_no_valida';
    end if;
    select array_agg(case ch when 'a' then 'atencion' when 'c' then 'comercial' else 'direccion' end order by ord)
      into v_areas
      from regexp_split_to_table(v_sala, '') with ordinality as t(ch, ord);
    if not (v_area_origen = any (v_areas)) then
      raise exception 'sala_no_valida';
    end if;

    foreach v_area in array v_areas loop
      v_copia := null;
      -- La copia de esa área (la busca por su «teléfono»: las copias que vienen de la 0202 pueden colgar de otro número).
      select id into v_copia from whatsapp_conversaciones where telefono = 'interno:' || v_sala || ':' || v_area order by id limit 1;
      if v_copia is null then
        insert into whatsapp_conversaciones (numero_id, telefono, area, nombre_perfil, estado)
        values (
          v_origen.numero_id,
          'interno:' || v_sala || ':' || v_area,
          v_area,
          case
            when v_sala = 'acd' then 'Todas las áreas'
            else (select case o when 'atencion' then 'Atención' when 'comercial' then 'Comercial' else 'Dirección' end from unnest(v_areas) as o where o <> v_area limit 1)
          end,
          'resuelta'
        )
        returning id into v_copia;
      end if;

      insert into whatsapp_mensajes (conversacion_id, direccion, tipo, texto, estado, autor_id, autor_nombre, momento, media_id, media_mime, media_nombre)
      values (v_copia, 'nota', p_tipo, nullif(v_texto, ''), 'enviado', p_autor_id, p_autor_nombre, v_ahora, nullif(p_media_id, ''), p_media_mime, p_media_nombre)
      returning id into v_id;

      if v_area = v_area_origen then
        v_mensaje := v_id;
        update whatsapp_conversaciones set ultimo_mensaje_en = v_ahora, ultimo_texto = v_resumen, ultimo_de = 'nota' where id = v_copia;
      else
        update whatsapp_conversaciones
           set ultimo_mensaje_en = v_ahora, ultimo_texto = v_resumen, ultimo_de = 'nota', no_leidos = coalesce(no_leidos, 0) + 1, estado = 'abierta'
         where id = v_copia;
      end if;
    end loop;
    return query select v_mensaje, v_ahora, v_origen.id;
    return;
  end if;

  -- ===== Un chat entre dos números de la empresa (0202) =====
  select * into v_desde from whatsapp_numeros where id = v_origen.numero_id;
  select * into v_hacia
    from whatsapp_numeros
   where activo
     and id <> v_origen.numero_id
     and regexp_replace(numero, '\D', '', 'g') = regexp_replace(v_origen.telefono, '\D', '', 'g')
   limit 1;
  if not found then
    raise exception 'no_es_chat_interno';
  end if;
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
  insert into whatsapp_mensajes (conversacion_id, direccion, tipo, texto, estado, autor_id, autor_nombre, momento, media_id, media_mime, media_nombre)
  values (p_conversacion, 'nota', p_tipo, nullif(v_texto, ''), 'enviado', p_autor_id, p_autor_nombre, v_ahora, nullif(p_media_id, ''), p_media_mime, p_media_nombre)
  returning id into v_mensaje;
  insert into whatsapp_mensajes (conversacion_id, direccion, tipo, texto, estado, autor_id, autor_nombre, momento, media_id, media_mime, media_nombre)
  values (v_espejo, 'nota', p_tipo, nullif(v_texto, ''), 'enviado', p_autor_id, p_autor_nombre, v_ahora, nullif(p_media_id, ''), p_media_mime, p_media_nombre);
  update whatsapp_conversaciones set ultimo_mensaje_en = v_ahora, ultimo_texto = v_resumen, ultimo_de = 'nota' where id = p_conversacion;
  update whatsapp_conversaciones
     set ultimo_mensaje_en = v_ahora, ultimo_texto = v_resumen, ultimo_de = 'nota', no_leidos = coalesce(no_leidos, 0) + 1, estado = 'abierta'
   where id = v_espejo;
  return query select v_mensaje, v_ahora, v_espejo;
end;
$$;

-- 2) Los chats entre dos números que ya existen (0202) pasan a ser la sala de dos áreas, con todo su historial. Si algo no encaja (dos números de la misma área, un
--    área desconocida o una copia repetida), esa conversación se deja como estaba y sigue funcionando con la rama de arriba.
do $$
declare
  r record;
  v_hacia whatsapp_numeros%rowtype;
  v_sala text;
  v_otra text;
begin
  for r in select * from whatsapp_conversaciones where telefono not like 'interno:%' loop
    select * into v_hacia
      from whatsapp_numeros n
     where n.activo
       and n.id <> r.numero_id
       and regexp_replace(n.numero, '\D', '', 'g') = regexp_replace(r.telefono, '\D', '', 'g')
     limit 1;
    continue when not found;
    continue when r.area = v_hacia.area or r.area not in ('atencion', 'comercial', 'direccion') or v_hacia.area not in ('atencion', 'comercial', 'direccion');
    v_sala := case
      when r.area in ('atencion', 'comercial') and v_hacia.area in ('atencion', 'comercial') then 'ac'
      when r.area in ('atencion', 'direccion') and v_hacia.area in ('atencion', 'direccion') then 'ad'
      else 'cd'
    end;
    v_otra := case v_hacia.area when 'atencion' then 'Atención' when 'comercial' then 'Comercial' else 'Dirección' end;
    begin
      update whatsapp_conversaciones
         set telefono = 'interno:' || v_sala || ':' || r.area, nombre_perfil = v_otra
       where id = r.id;
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$$;
