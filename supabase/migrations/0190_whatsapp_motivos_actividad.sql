-- CRM Dropshippers › Actividad del cliente: motivos que la IA va creando (pedido de Jhokser, 29 oct 2026, a raíz del caso de José Sinisterra: empezó la conversación preguntando por un
-- ID de Dropi y ningún motivo de la lista lo describía). Cuando el motivo principal de un día no cabe en la lista fija (`MOTIVOS`, src/lib/whatsapp/actividad.ts), la IA propone una etiqueta
-- nueva; si no se parece a una que ya existe, se guarda aquí y desde entonces es uno más de la lista: se le ofrece a la IA en los siguientes análisis y se cuenta igual que los demás
-- en la pestaña Motivos. El id empieza por «nuevo_». Tope: 60 motivos propios y 3 nuevos por pedido.
-- Código: src/app/(app)/crm-dropshippers/bandeja/actividad-actions.ts. Reversa: supabase/rollbacks/0190_rollback.sql

create table if not exists whatsapp_actividad_motivos (
  id text primary key check (id ~ '^nuevo_[a-z0-9_]{1,60}$'),
  etiqueta text not null check (length(btrim(etiqueta)) between 8 and 80),
  -- De qué chat salió la primera vez, para entender por qué se creó.
  conversacion_id uuid,
  creado_por text not null default 'IA',
  creado_en timestamptz not null default now()
);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table whatsapp_actividad_motivos enable row level security;
