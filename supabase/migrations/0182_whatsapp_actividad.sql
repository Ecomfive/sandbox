-- CRM Dropshippers › Bandeja de WhatsApp: actividad del cliente (pedido de Jhokser, 29 oct 2026). Una fila por chat y por día (hora de Panamá) con por qué escribió el dropshipper,
-- analizado con IA a partir de sus mensajes: los motivos (de una lista fija, para poder contarlos), un resumen corto y si la consulta quedó resuelta. `firma` (cantidad de mensajes del
-- día + el último) dice si llegó algo nuevo y hay que volver a analizar ese día. Solo es una copia de lo que se entiende de los mensajes: los mensajes no se tocan.
-- Código: src/app/(app)/crm-dropshippers/bandeja/actividad-actions.ts. Reversa: supabase/rollbacks/0182_rollback.sql

create table if not exists whatsapp_actividad (
  id uuid primary key default uuid_v7(),
  conversacion_id uuid not null references whatsapp_conversaciones(id) on delete restrict,
  dia date not null,
  motivos text[] not null default '{}',
  resumen text not null default '',
  estado text not null check (estado in ('resuelta', 'pendiente', 'sin_consulta')),
  mensajes integer not null default 0,
  firma text not null,
  modelo text,
  analizado_por text,
  analizado_en timestamptz not null default now(),
  unique (conversacion_id, dia)
);
create index if not exists whatsapp_actividad_dia_idx on whatsapp_actividad (dia desc);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table whatsapp_actividad enable row level security;
