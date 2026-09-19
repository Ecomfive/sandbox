-- "Accesos rapidos" del menu: cada usuario puede marcar paginas del menu para que le
-- aparezcan arriba de todo, sin tener que buscarlas en su seccion/grupo cada vez.

create table favoritos_nav (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles(id) on delete cascade,
  href text not null,
  creado_en timestamptz not null default now(),
  unique (usuario_id, href)
);

alter table favoritos_nav enable row level security;

create policy "favoritos_nav autenticados" on favoritos_nav
  for all using (auth.role() = 'authenticated');
