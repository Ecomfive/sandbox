-- CRM Dropshippers: varios números de WhatsApp por dropshipper (pedido de Jhokser, 29 oct 2026). Hasta hoy un chat de WhatsApp solo se enlazaba solo con el dropshipper cuyo
-- `contacto_telefono` fuera exactamente el número que escribía. Quien usa dos números (o escribe desde otro) no se reconocía. Al vincular un chat a mano con un dropshipper que ya
-- tiene otro número, el número del chat se guarda aquí y los próximos mensajes de ese número se enlazan solos.
--   * `contacto_telefono` sigue siendo el número principal (único, el que se escribe en la ficha). Esta tabla guarda los demás, también únicos entre todos los dropshippers.
--   * El número nunca se muestra en pantalla (ver `src/lib/whatsapp/telefono-oculto.ts`): esta tabla solo la lee el servidor.
-- Código: src/lib/whatsapp/vinculo.ts, src/app/(app)/crm-dropshippers/bandeja/vincular-actions.ts. Reversa: supabase/rollbacks/0177_rollback.sql

create table if not exists dropshipper_telefonos (
  id uuid primary key default uuid_v7(),
  dropshipper_id uuid not null references dropshippers(id) on delete cascade,
  telefono text not null unique,
  creado_en timestamptz not null default now(),
  creado_por text
);
create index if not exists dropshipper_telefonos_dropshipper_idx on dropshipper_telefonos (dropshipper_id);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table dropshipper_telefonos enable row level security;
