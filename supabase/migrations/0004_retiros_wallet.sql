-- Seguimiento manual de saldo de wallet y retiros por país/plataforma.
-- Igual que los extractos bancarios, esto se registra a mano hasta que
-- haya una extracción automática confiable del panel de cada plataforma.

create table saldos_wallet (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  plataforma_id uuid not null references plataformas(id),
  monto numeric(12, 2) not null,
  fecha date not null,
  creado_en timestamptz not null default now(),
  unique (pais_id, plataforma_id, fecha)
);

create table retiros (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  plataforma_id uuid not null references plataformas(id),
  monto numeric(12, 2) not null,
  fecha date not null,
  estado text not null default 'solicitado' check (estado in ('solicitado', 'procesado', 'rechazado')),
  notas text,
  creado_en timestamptz not null default now()
);

alter table saldos_wallet enable row level security;
alter table retiros enable row level security;

create policy "authenticated read/write" on saldos_wallet for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on retiros for all using (auth.role() = 'authenticated');
