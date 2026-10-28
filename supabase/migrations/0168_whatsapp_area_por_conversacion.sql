-- CRM Dropshippers › un solo número de WhatsApp para todo el equipo (pedido de Hernán, 28 oct 2026; boceto
-- https://claude.ai/artifact/Sn3pB4cdUixXk6WdRh4kr8). El área (Atención, Comercial, Dirección) pasa a ser de cada conversación y no del
-- número: todo chat nuevo entra con el área de su número (Atención si es el único) y se puede «pasar a otra área» desde la bandeja.
-- Quien no ve esa área deja de ver el chat. Los KPIs se cuentan por el área de la conversación.
-- Reversa: supabase/rollbacks/0168_rollback.sql

alter table whatsapp_conversaciones add column if not exists area text;
update whatsapp_conversaciones c set area = n.area from whatsapp_numeros n where n.id = c.numero_id and c.area is null;
update whatsapp_conversaciones set area = 'atencion' where area is null;
alter table whatsapp_conversaciones alter column area set default 'atencion';
alter table whatsapp_conversaciones alter column area set not null;
alter table whatsapp_conversaciones drop constraint if exists whatsapp_conversaciones_area_check;
alter table whatsapp_conversaciones add constraint whatsapp_conversaciones_area_check check (area in ('atencion', 'comercial', 'direccion'));
create index if not exists whatsapp_conversaciones_area_idx on whatsapp_conversaciones (area, ultimo_mensaje_en desc nulls last);

-- Una conversación nueva toma el área de su número (las funciones de 0158 y 0164 no la mandan).
create or replace function whatsapp_conversacion_area_inicial() returns trigger
language plpgsql
set search_path = public
as $$
begin
  select n.area into new.area from whatsapp_numeros n where n.id = new.numero_id;
  if new.area is null then new.area := 'atencion'; end if;
  return new;
end;
$$;
drop trigger if exists whatsapp_conversacion_area_inicial on whatsapp_conversaciones;
create trigger whatsapp_conversacion_area_inicial before insert on whatsapp_conversaciones
  for each row execute function whatsapp_conversacion_area_inicial();

-- KPIs (como en 0164), ahora por el área de la conversación. Además del desglose por número, uno por área.
create or replace function whatsapp_kpis(p_desde timestamptz, p_areas text[])
returns jsonb
language sql
stable
set search_path = public
as $$
  with msj as (
    select m.id, m.conversacion_id, m.direccion, m.momento, m.autor_nombre, c.numero_id, c.area,
           lag(m.direccion) over (partition by m.conversacion_id order by m.momento, m.id) as previa
    from whatsapp_mensajes m
    join whatsapp_conversaciones c on c.id = m.conversacion_id
    where m.direccion <> 'nota' and c.area = any(p_areas) and m.momento >= p_desde - interval '2 days'
  ),
  consultas as (
    select q.conversacion_id, q.numero_id, q.area, q.momento as pregunta_en, r.momento as respuesta_en, r.autor_nombre,
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
    where n.activo
  ),
  por_area as (
    select a.area,
      (select count(distinct p.conversacion_id) from periodo p where p.area = a.area) as conversaciones,
      (select count(*) from consultas k where k.area = a.area) as consultas,
      (select count(*) from consultas k where k.area = a.area and k.respuesta_en is null) as sin_responder,
      (select count(*) from consultas k where k.area = a.area and k.minutos <= 15) as en_15_min,
      (select round(percentile_cont(0.5) within group (order by k.minutos)::numeric, 1) from consultas k where k.area = a.area and k.minutos is not null) as mediana_min
    from unnest(p_areas) as a(area)
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
    'numeros', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre) from por_numero x), '[]'::jsonb),
    'areas', coalesce((select jsonb_agg(to_jsonb(x)) from por_area x), '[]'::jsonb),
    'personas', coalesce((select jsonb_agg(to_jsonb(x) order by x.enviados desc) from por_persona x), '[]'::jsonb),
    'dias', coalesce((select jsonb_agg(to_jsonb(x) order by x.dia) from por_dia x), '[]'::jsonb)
  );
$$;
revoke all on function whatsapp_kpis(timestamptz, text[]) from public, anon, authenticated;
revoke all on function whatsapp_conversacion_area_inicial() from public, anon, authenticated;
