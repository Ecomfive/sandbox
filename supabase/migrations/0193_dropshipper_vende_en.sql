-- CRM: dónde vende cada dropshipper, puesto a mano (29 oct 2026, pedido de Alcides): una plataforma en un país («Dropi Panamá», «EFFI Costa Rica»).
-- Las cuentas vinculadas (`dropshipper_cuentas`, de los pedidos importados) ya dicen dónde vende; esto es para lo que todavía no se importa o no se
-- ha vinculado. Se pone y se quita desde el chat de la Bandeja, como las etiquetas. RLS sin políticas: solo el servidor la toca (migración 0063).
-- Reversa: supabase/rollbacks/0193_rollback.sql

create table if not exists dropshipper_vende_en (
  id uuid primary key default gen_random_uuid(),
  dropshipper_id uuid not null references dropshippers(id) on delete cascade,
  plataforma_id uuid not null references plataformas(id),
  pais_id uuid not null references paises(id),
  creado_por uuid,
  creado_en timestamptz not null default now(),
  unique (dropshipper_id, plataforma_id, pais_id)
);
create index if not exists dropshipper_vende_en_ds on dropshipper_vende_en (dropshipper_id);
alter table dropshipper_vende_en enable row level security;
