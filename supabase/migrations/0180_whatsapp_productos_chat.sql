-- CRM Dropshippers: los productos que pregunta un dropshipper en su chat (pedido de Hernán, 29 oct 2026). La ficha del panel derecho de la bandeja
-- dice cuándo llega lo que pregunta (como «En camino» de Gestión de IDs Dropi). Los que el chat nombra salen solos como sugerencia; los que alguien
-- fija en la ficha («Fijar» o «Agregar producto») se guardan aquí y se ven cada vez que se abre ese chat, para todo el equipo.
-- Código: src/app/(app)/crm-dropshippers/bandeja/productos-chat-actions.ts. Reversa: supabase/rollbacks/0180_rollback.sql

create table if not exists whatsapp_conversacion_productos (
  conversacion_id uuid not null references whatsapp_conversaciones(id) on delete cascade,
  sku_id uuid not null references skus_maestros(id) on delete cascade,
  agregado_por text,
  creado_en timestamptz not null default now(),
  primary key (conversacion_id, sku_id)
);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table whatsapp_conversacion_productos enable row level security;
