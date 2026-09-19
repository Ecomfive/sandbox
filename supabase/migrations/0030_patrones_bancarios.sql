-- Diccionario de patrones bancarios: recuerda a que plataforma corresponde un texto de
-- descripcion de extracto bancario, para no tener que asignarla a mano cada vez que se
-- repite (o se parece) un movimiento ya visto antes.

create table patrones_bancarios (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  fragmento text not null,
  plataforma_id uuid not null references plataformas(id) on delete cascade,
  creado_en timestamptz not null default now(),
  unique (pais_id, fragmento)
);

alter table patrones_bancarios enable row level security;

create policy "patrones_bancarios autenticados" on patrones_bancarios
  for all using (auth.role() = 'authenticated');
