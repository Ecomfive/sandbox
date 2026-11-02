-- CRM Dropshippers › Bandeja de WhatsApp: borrar un chat o un mensaje solo con autorización (pedido de Jhokser, 28 oct 2026). Nadie borra por su cuenta: quien quiere
-- borrar algo lo **pide** con su motivo, la persona por encima de ella en Puestos y organigrama (o, si no tiene jefe, un administrador) lo **autoriza o lo rechaza**, y
-- recién entonces se **oculta**: sale de la bandeja para todos pero se conserva en la base y un administrador lo puede recuperar. La migración 0171 sigue impidiendo
-- cualquier DELETE de verdad.
--   * whatsapp_solicitudes_borrado: la petición (chat o mensaje), su motivo, quién la hizo, quiénes pueden resolverla (`autoriza_a`) y cómo terminó.
--   * whatsapp_conversaciones.oculta_en / oculta_por y whatsapp_mensajes.oculto_en / oculto_por: lo que ya se autorizó ocultar.
-- Código: src/lib/whatsapp/borrado.ts, src/app/(app)/crm-dropshippers/borrados/. Reversa: supabase/rollbacks/0172_rollback.sql

alter table whatsapp_conversaciones add column if not exists oculta_en timestamptz;
alter table whatsapp_conversaciones add column if not exists oculta_por text;
alter table whatsapp_mensajes add column if not exists oculto_en timestamptz;
alter table whatsapp_mensajes add column if not exists oculto_por text;

create table if not exists whatsapp_solicitudes_borrado (
  id uuid primary key default uuid_v7(),
  tipo text not null check (tipo in ('chat', 'mensaje')),
  conversacion_id uuid not null references whatsapp_conversaciones(id) on delete restrict,
  mensaje_id uuid references whatsapp_mensajes(id) on delete restrict,
  check ((tipo = 'mensaje') = (mensaje_id is not null)),
  motivo text not null check (length(btrim(motivo)) >= 5),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'autorizada', 'rechazada', 'cancelada')),
  solicitante_id uuid references perfiles(id) on delete set null,
  solicitante_nombre text not null,
  -- Quiénes pueden autorizar o rechazar: el jefe de quien lo pide o, si no tiene, los administradores (nunca quien lo pide).
  autoriza_a uuid[] not null default '{}',
  resuelta_por uuid references perfiles(id) on delete set null,
  resuelta_por_nombre text,
  resuelta_en timestamptz,
  nota_resolucion text,
  creado_en timestamptz not null default now()
);
-- Una sola petición pendiente por chat o por mensaje.
create unique index if not exists whatsapp_solicitudes_borrado_chat_unica on whatsapp_solicitudes_borrado (conversacion_id) where tipo = 'chat' and estado = 'pendiente';
create unique index if not exists whatsapp_solicitudes_borrado_mensaje_unica on whatsapp_solicitudes_borrado (mensaje_id) where tipo = 'mensaje' and estado = 'pendiente';
create index if not exists whatsapp_solicitudes_borrado_estado_idx on whatsapp_solicitudes_borrado (estado, creado_en desc);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table whatsapp_solicitudes_borrado enable row level security;
