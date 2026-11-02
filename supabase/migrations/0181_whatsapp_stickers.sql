-- CRM Dropshippers › Bandeja de WhatsApp: los stickers del equipo (pedido de Jhokser, 29 oct 2026). Una imagen que el equipo sube se convierte a sticker de WhatsApp (WebP de 512 × 512) y
-- queda aquí para mandarla desde el chat. El archivo vive en el almacén `whatsapp-importados`, en `stickers/`. Los GIF y los stickers de GIPHY no se guardan: se piden al mandarlos.
-- Código: src/app/(app)/crm-dropshippers/bandeja/expresiones-actions.ts. Reversa: supabase/rollbacks/0181_rollback.sql

create table if not exists whatsapp_stickers (
  id uuid primary key default uuid_v7(),
  nombre text not null,
  ruta text not null unique,
  animado boolean not null default false,
  creado_por text,
  creado_en timestamptz not null default now()
);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table whatsapp_stickers enable row level security;
