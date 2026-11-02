-- Bandeja de WhatsApp: etiquetas en los chats, como las de ClickUp y las de Compras (pedido de Alcides, 29 oct 2026). Cada chat
-- lleva su lista de etiquetas (`whatsapp_conversaciones.etiquetas`); el color es de la etiqueta (por su nombre), no del chat: una
-- etiqueta «Garantía» roja se ve roja en todos. Sin color elegido, la etiqueta usa uno automático según su nombre.
-- RLS sin políticas: solo el servidor las toca (ver migración 0063 y SEGURIDAD.md).

alter table whatsapp_conversaciones add column if not exists etiquetas text[] not null default '{}';

create index if not exists whatsapp_conversaciones_etiquetas_idx on whatsapp_conversaciones using gin (etiquetas);

create table if not exists whatsapp_etiquetas (
  nombre text primary key check (btrim(nombre) <> ''),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  actualizado_en timestamptz not null default now()
);
alter table whatsapp_etiquetas enable row level security;
