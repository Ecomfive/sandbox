-- CRM Dropshippers › WhatsApp directo al sistema (pedido de Hernán, 26 oct 2026): sin Chatwoot. Meta (WhatsApp Cloud API) avisa cada
-- mensaje al webhook del sistema (/api/whatsapp/webhook) y aquí queda todo: los números de la empresa, una conversación por número y
-- teléfono del dropshipper, y cada mensaje (los que llegan, los que manda el equipo y las notas privadas). Así el historial es nuestro
-- aunque un número se pierda. Código: src/lib/whatsapp/, src/app/api/whatsapp/webhook/, src/app/(app)/crm-dropshippers/bandeja/.
-- Reversa: supabase/rollbacks/0158_rollback.sql

create table if not exists whatsapp_numeros (
  id uuid primary key default uuid_v7(),
  -- El identificador del número en Meta (phone_number_id): es lo que trae cada aviso y lo que pide el envío.
  phone_number_id text not null unique,
  -- «+50760000000».
  numero text not null,
  -- «Atención», «Comercial · Hernán».
  nombre text not null,
  -- Quién ve sus conversaciones: Atención (módulo crm-dropshippers) o Comercial (crm-comercial, que ve también Atención).
  area text not null default 'atencion' check (area in ('atencion', 'comercial')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists whatsapp_conversaciones (
  id uuid primary key default uuid_v7(),
  numero_id uuid not null references whatsapp_numeros(id) on delete restrict,
  -- El WhatsApp del dropshipper, en formato internacional («+50761112233»).
  telefono text not null,
  -- El nombre de su perfil de WhatsApp (el que manda Meta).
  nombre_perfil text,
  dropshipper_id uuid references dropshippers(id) on delete set null,
  asignada_a uuid references perfiles(id) on delete set null,
  estado text not null default 'abierta' check (estado in ('abierta', 'resuelta')),
  no_leidos integer not null default 0,
  -- El último mensaje del dropshipper: desde ahí corren las 24 h en que se puede responder con texto libre.
  ultimo_entrante_en timestamptz,
  ultimo_mensaje_en timestamptz,
  ultimo_texto text,
  ultimo_de text check (ultimo_de in ('entrante', 'saliente', 'nota')),
  creado_en timestamptz not null default now(),
  unique (numero_id, telefono)
);
create index if not exists whatsapp_conversaciones_ultimo_idx on whatsapp_conversaciones (ultimo_mensaje_en desc nulls last);
create index if not exists whatsapp_conversaciones_dropshipper_idx on whatsapp_conversaciones (dropshipper_id);

create table if not exists whatsapp_mensajes (
  id uuid primary key default uuid_v7(),
  conversacion_id uuid not null references whatsapp_conversaciones(id) on delete cascade,
  direccion text not null check (direccion in ('entrante', 'saliente', 'nota')),
  -- texto, imagen, audio, video, documento, sticker, ubicacion, reaccion, plantilla u otro.
  tipo text not null default 'texto',
  texto text,
  -- Un archivo (foto, audio, documento): su id en Meta para descargarlo, su tipo y su nombre.
  media_id text,
  media_mime text,
  media_nombre text,
  -- El id del mensaje en WhatsApp («wamid…»): evita guardar dos veces el mismo aviso y enlaza los estados (entregado, leído).
  wa_id text unique,
  estado text not null default 'recibido' check (estado in ('recibido', 'enviando', 'enviado', 'entregado', 'leido', 'fallido')),
  error text,
  autor_id uuid references perfiles(id) on delete set null,
  autor_nombre text,
  -- Cuándo se mandó (la hora de WhatsApp en los que llegan).
  momento timestamptz not null default now(),
  creado_en timestamptz not null default now()
);
create index if not exists whatsapp_mensajes_conversacion_idx on whatsapp_mensajes (conversacion_id, momento);

-- Un mensaje que llega, en una sola operación: registra el número de la empresa si es nuevo, abre (o reabre) la conversación,
-- guarda el mensaje sin repetirlo (Meta puede mandar el mismo aviso dos veces) y, solo si es nuevo, suma un no leído.
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
      set no_leidos = no_leidos + 1,
          estado = 'abierta',
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

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table whatsapp_numeros enable row level security;
alter table whatsapp_conversaciones enable row level security;
alter table whatsapp_mensajes enable row level security;
