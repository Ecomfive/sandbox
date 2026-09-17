-- Registro de gastos operativos (incluye nómina como una categoría más).
-- Igual que los demás módulos financieros, se carga a mano por ahora.

create table gastos (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  categoria text not null check (
    categoria in ('nomina', 'alquiler', 'servicios', 'marketing', 'logistica', 'otros')
  ),
  descripcion text not null,
  monto numeric(12, 2) not null,
  fecha date not null,
  creado_en timestamptz not null default now()
);

alter table gastos enable row level security;

create policy "authenticated read/write" on gastos for all using (auth.role() = 'authenticated');
