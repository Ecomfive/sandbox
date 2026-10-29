-- CRM Dropshippers › Bandeja de WhatsApp: prioridad de cada chat (pedido de Hernán, 29 oct 2026). La IA lee los últimos mensajes y dice el motivo del chat (queja, pedido, pagos,
-- consulta, comercial u otro); cada motivo tiene su plazo de respuesta y la lista se ordena por lo cerca o pasado que está ese plazo. El equipo corrige el motivo con un toque y esas
-- correcciones se le dan a la IA como ejemplo. Código: src/lib/whatsapp/prioridad.ts y src/lib/whatsapp/clasificar.ts. Reversa: supabase/rollbacks/0189_rollback.sql

-- Desde cuándo espera el cliente: su primer mensaje que el equipo todavía no contestó (null si ya se le contestó). El plazo corre desde aquí, no desde su último mensaje:
-- si escribe tres veces seguidas, sigue esperando desde la primera.
alter table whatsapp_conversaciones add column if not exists esperando_desde timestamptz;
-- El grupo de prioridad del chat (src/lib/whatsapp/prioridad.ts) y el motivo específico que eligió la IA (la lista de src/lib/whatsapp/actividad.ts).
alter table whatsapp_conversaciones add column if not exists motivo_grupo text check (motivo_grupo in ('queja', 'pedido', 'pagos', 'consulta', 'comercial', 'otro'));
alter table whatsapp_conversaciones add column if not exists motivo text;
-- Una frase corta de por qué escribe (la escribe la IA, sin datos personales).
alter table whatsapp_conversaciones add column if not exists motivo_resumen text;
-- Quién lo puso: la IA o una persona del equipo. Lo que puso una persona no lo cambia la IA mientras el cliente siga esperando por lo mismo.
alter table whatsapp_conversaciones add column if not exists motivo_por text check (motivo_por in ('ia', 'persona'));
alter table whatsapp_conversaciones add column if not exists motivo_por_nombre text;
alter table whatsapp_conversaciones add column if not exists motivo_en timestamptz;
-- Cuándo se le pidió a la IA por última vez: evita pedir dos veces a la vez cuando llegan varios mensajes juntos.
alter table whatsapp_conversaciones add column if not exists motivo_pedido_en timestamptz;
create index if not exists whatsapp_conversaciones_esperando_idx on whatsapp_conversaciones (esperando_desde) where esperando_desde is not null;

-- Al guardar un mensaje: uno del cliente (no una reacción) empieza la espera si no había; uno del equipo (desde la bandeja o desde el celular) la termina.
-- Las notas internas no cuentan. Un mensaje viejo del cliente que ya tuvo respuesta (al importar un historial) no abre ninguna espera.
create or replace function whatsapp_marcar_espera() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.direccion = 'entrante' and new.tipo <> 'reaccion' then
    update whatsapp_conversaciones set esperando_desde = new.momento
     where id = new.conversacion_id and (esperando_desde is null or esperando_desde > new.momento)
       and not exists (select 1 from whatsapp_mensajes s where s.conversacion_id = new.conversacion_id and s.direccion = 'saliente' and s.momento >= new.momento);
  elsif new.direccion = 'saliente' then
    update whatsapp_conversaciones set esperando_desde = null
     where id = new.conversacion_id and esperando_desde is not null and esperando_desde <= new.momento;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_mensajes_espera on whatsapp_mensajes;
create trigger whatsapp_mensajes_espera after insert on whatsapp_mensajes for each row execute function whatsapp_marcar_espera();

-- Los chats que hoy esperan respuesta: desde su primer mensaje después de la última respuesta del equipo.
update whatsapp_conversaciones c
   set esperando_desde = (
     select min(m.momento) from whatsapp_mensajes m
      where m.conversacion_id = c.id and m.direccion = 'entrante' and m.tipo <> 'reaccion'
        and m.momento > coalesce((select max(s.momento) from whatsapp_mensajes s where s.conversacion_id = c.id and s.direccion = 'saliente'), '-infinity'::timestamptz)
   )
 where c.esperando_desde is null;

-- Las correcciones del equipo: qué dijo la IA, qué puso la persona y el último mensaje del cliente (sin teléfonos ni correos). Las más recientes se le dan a la IA como ejemplo.
create table if not exists whatsapp_motivo_correcciones (
  id uuid primary key default uuid_v7(),
  conversacion_id uuid not null references whatsapp_conversaciones(id) on delete restrict,
  grupo_ia text,
  grupo_nuevo text not null check (grupo_nuevo in ('queja', 'pedido', 'pagos', 'consulta', 'comercial', 'otro')),
  texto_cliente text,
  corregido_por uuid references perfiles(id) on delete set null,
  corregido_por_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists whatsapp_motivo_correcciones_creado_idx on whatsapp_motivo_correcciones (creado_en desc);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table whatsapp_motivo_correcciones enable row level security;

notify pgrst, 'reload schema';
