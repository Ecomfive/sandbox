-- Reversa de 0204_whatsapp_chat_interno_documentos_reacciones.sql: vuelve la función de la 0203 (sin salas de un área, documentos ni reacciones) y se quita la de reacciones.
-- Los documentos, las salas de un área y las reacciones ya guardados se quedan en la base (solo que sin la función nueva no se podrá escribir en una sala de un área).
drop function if exists whatsapp_reaccionar_interno(uuid, uuid, text, uuid, text);

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
