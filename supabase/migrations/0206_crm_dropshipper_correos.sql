-- CRM Dropshippers: varios correos por dropshipper (30 oct 2026, pedido de Alcides). Un dropshipper puede tener una cuenta con un correo en Dropi y otra
-- con otro correo en EFFI o Boxful; guardarlos todos sirve para reconocer después sus cuentas y sus pedidos en cada plataforma.
--   * `dropshippers.contacto_email` sigue siendo el correo principal (el primero de la lista de la ficha). Esta tabla guarda los demás.
--   * Cada correo es de un solo dropshipper: único aquí, y el servidor comprueba además que no sea el principal de otro (`cambiarDatoDropshipper`).
--   * Se guardan en minúsculas.
-- Se edita en la ficha: «Datos» › Correo (`DatoLista`, `dato-editable.tsx`; `cambiarDatoDropshipper`, `dato-actions.ts`). Se puede correr dos veces.
-- Reversa: supabase/rollbacks/0206_rollback.sql

create table if not exists dropshipper_correos (
  id uuid primary key default uuid_v7(),
  dropshipper_id uuid not null references dropshippers(id) on delete cascade,
  correo text not null unique check (correo = lower(correo) and correo like '%@%'),
  creado_en timestamptz not null default now(),
  creado_por text
);
create index if not exists dropshipper_correos_dropshipper_idx on dropshipper_correos (dropshipper_id);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table dropshipper_correos enable row level security;
