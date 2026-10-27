-- CRM Dropshippers › Dirección y KPIs de WhatsApp (pedido de Hernán, 27 oct 2026).
--  1. Un área nueva para los números de WhatsApp: «direccion» (el CEO). Sus chats solo los ve quien tiene el módulo `crm-direccion`,
--     que además ve Comercial y Atención (src/lib/crm/areas.ts). Comercial sigue viendo Atención; Atención solo lo suyo.
--  2. Coexistencia: un número que sigue en la app WhatsApp Business del celular y además está en la API. Lo que se responde desde el
--     celular llega al webhook como «smb_message_echoes» y se guarda como saliente, para que la bandeja y los KPIs lo cuenten.
--  3. `whatsapp_kpis`: los indicadores de la bandeja para el CEO (tiempo de respuesta, sin responder, volumen por número y por persona).
-- Reversa: supabase/rollbacks/0164_rollback.sql

alter table whatsapp_numeros drop constraint if exists whatsapp_numeros_area_check;
alter table whatsapp_numeros add constraint whatsapp_numeros_area_check check (area in ('atencion', 'comercial', 'direccion'));

-- El rol Admin obtiene el módulo nuevo. Los demás roles se lo dan desde «Usuarios y roles».
insert into permisos_rol (rol_id, modulo)
select r.id, 'crm-direccion'
from roles r
where r.nombre = 'Admin'
  and not exists (select 1 from permisos_rol p where p.rol_id = r.id and p.modulo = 'crm-direccion');

-- Un mensaje que se mandó desde la app del celular (coexistencia). Igual que `whatsapp_registrar_entrante`, pero queda como saliente:
-- no suma no leídos y, si es lo último de la conversación, la deja como respondida.
create or replace function whatsapp_registrar_saliente_celular(
  p_phone_number_id text,
  p_numero text,
  p_telefono text,
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

  insert into whatsapp_conversaciones (numero_id, telefono, dropshipper_id)
  values (v_numero, p_telefono, p_dropshipper_id)
  on conflict (numero_id, telefono) do update
    set dropshipper_id = coalesce(whatsapp_conversaciones.dropshipper_id, excluded.dropshipper_id)
  returning id into v_conversacion;

  insert into whatsapp_mensajes (conversacion_id, direccion, tipo, texto, media_id, media_mime, media_nombre, wa_id, estado, autor_nombre, momento)
  values (v_conversacion, 'saliente', p_tipo, p_texto, p_media_id, p_media_mime, p_media_nombre, p_wa_id, 'enviado', 'Desde el celular', p_momento)
  on conflict (wa_id) do nothing
  returning id into v_nuevo;

  if v_nuevo is not null then
    update whatsapp_conversaciones
      set ultimo_texto = case when ultimo_mensaje_en is null or p_momento >= ultimo_mensaje_en then p_resumen else ultimo_texto end,
          ultimo_de = case when ultimo_mensaje_en is null or p_momento >= ultimo_mensaje_en then 'saliente' else ultimo_de end,
          no_leidos = case when ultimo_mensaje_en is null or p_momento >= ultimo_mensaje_en then 0 else no_leidos end,
          ultimo_mensaje_en = greatest(coalesce(ultimo_mensaje_en, p_momento), p_momento)
      where id = v_conversacion;
  end if;
  return v_conversacion;
end;
$$;
revoke all on function whatsapp_registrar_saliente_celular(text, text, text, uuid, text, text, text, text, text, text, timestamptz, text) from public, anon, authenticated;

-- Los KPIs de la bandeja desde `p_desde`, solo de los números de `p_areas`. Una «consulta» es el primer mensaje del dropshipper después
-- de una respuesta del equipo (varios mensajes seguidos cuentan como una); su tiempo de respuesta llega hasta el primer saliente
-- siguiente. Las notas privadas no cuentan. Devuelve { numeros: [...], personas: [...], dias: [...] }.
create or replace function whatsapp_kpis(p_desde timestamptz, p_areas text[])
returns jsonb
language sql
stable
set search_path = public
as $$
  with msj as (
    select m.id, m.conversacion_id, m.direccion, m.momento, m.autor_nombre, c.numero_id,
           lag(m.direccion) over (partition by m.conversacion_id order by m.momento, m.id) as previa
    from whatsapp_mensajes m
    join whatsapp_conversaciones c on c.id = m.conversacion_id
    join whatsapp_numeros n on n.id = c.numero_id
    where m.direccion <> 'nota' and n.area = any(p_areas) and m.momento >= p_desde - interval '2 days'
  ),
  consultas as (
    select q.conversacion_id, q.numero_id, q.momento as pregunta_en, r.momento as respuesta_en, r.autor_nombre,
           extract(epoch from (r.momento - q.momento)) / 60.0 as minutos
    from msj q
    left join lateral (
      select x.momento, coalesce(x.autor_nombre, 'Sin nombre') as autor_nombre
      from whatsapp_mensajes x
      where x.conversacion_id = q.conversacion_id and x.direccion = 'saliente' and x.momento >= q.momento
      order by x.momento
      limit 1
    ) r on true
    where q.direccion = 'entrante' and (q.previa is null or q.previa <> 'entrante') and q.momento >= p_desde
  ),
  periodo as (select * from msj where momento >= p_desde),
  por_numero as (
    select n.id, n.nombre, n.numero, n.area,
      (select count(distinct p.conversacion_id) from periodo p where p.numero_id = n.id) as conversaciones,
      (select count(*) from periodo p where p.numero_id = n.id and p.direccion = 'entrante') as recibidos,
      (select count(*) from periodo p where p.numero_id = n.id and p.direccion = 'saliente') as enviados,
      (select count(*) from consultas k where k.numero_id = n.id) as consultas,
      (select count(*) from consultas k where k.numero_id = n.id and k.respuesta_en is null) as sin_responder,
      (select count(*) from consultas k where k.numero_id = n.id and k.minutos <= 15) as en_15_min,
      (select round(percentile_cont(0.5) within group (order by k.minutos)::numeric, 1) from consultas k where k.numero_id = n.id and k.minutos is not null) as mediana_min,
      (select round(avg(k.minutos)::numeric, 1) from consultas k where k.numero_id = n.id and k.minutos is not null) as promedio_min
    from whatsapp_numeros n
    where n.activo and n.area = any(p_areas)
  ),
  por_persona as (
    select e.persona, e.enviados,
      count(k.pregunta_en) as respondidas,
      round(percentile_cont(0.5) within group (order by k.minutos)::numeric, 1) as mediana_min,
      count(*) filter (where k.minutos <= 15) as en_15_min
    from (
      select coalesce(autor_nombre, 'Sin nombre') as persona, count(*) as enviados
      from periodo
      where direccion = 'saliente'
      group by 1
    ) e
    left join consultas k on k.autor_nombre = e.persona
    group by e.persona, e.enviados
  ),
  por_dia as (
    select (k.pregunta_en at time zone 'America/Panama')::date as dia,
      count(*) as consultas,
      count(*) filter (where k.respuesta_en is null) as sin_responder,
      round(percentile_cont(0.5) within group (order by k.minutos)::numeric, 1) as mediana_min
    from consultas k
    group by 1
  )
  select jsonb_build_object(
    'numeros', coalesce((select jsonb_agg(to_jsonb(x) order by x.area, x.nombre) from por_numero x), '[]'::jsonb),
    'personas', coalesce((select jsonb_agg(to_jsonb(x) order by x.enviados desc) from por_persona x), '[]'::jsonb),
    'dias', coalesce((select jsonb_agg(to_jsonb(x) order by x.dia) from por_dia x), '[]'::jsonb)
  );
$$;
revoke all on function whatsapp_kpis(timestamptz, text[]) from public, anon, authenticated;
