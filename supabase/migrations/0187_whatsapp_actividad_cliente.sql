-- CRM Dropshippers › Actividad del cliente: análisis completo por chat (pedido de Jhokser, 29 oct 2026). Una fila por chat con la lectura que hace la IA de todo lo que se sabe del cliente
-- (cómo es el trato, tono, urgencia, riesgo de que se vaya, lo que el equipo prometió y sigue pendiente, oportunidades y qué hacer ahora). Se rehace cada vez que se pulsa «Volver a analizar».
-- Código: src/app/(app)/crm-dropshippers/bandeja/actividad-actions.ts. Reversa: supabase/rollbacks/0187_rollback.sql

create table if not exists whatsapp_actividad_cliente (
  id uuid primary key default uuid_v7(),
  conversacion_id uuid not null unique references whatsapp_conversaciones(id) on delete restrict,
  datos jsonb not null,
  dias_analizados integer not null default 0,
  modelo text,
  analizado_por text,
  analizado_en timestamptz not null default now()
);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table whatsapp_actividad_cliente enable row level security;
