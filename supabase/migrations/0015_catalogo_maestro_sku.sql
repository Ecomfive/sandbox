-- Catalogo maestro de SKU (Componente 7 del plan): un SKU maestro representa
-- un producto fisico unico, independiente de la plataforma en la que se venda.
-- Cada fila de `productos` (que hoy vive por pais+plataforma+sku) se vincula
-- opcionalmente a un sku_maestro para poder cuadrar el inventario entre
-- plataformas. Los combos se arman como una lista de SKUs maestros simples
-- con cantidad. Gobernado por un flujo de aprobacion: propuesto -> en
-- revision -> aprobado.

create table skus_maestros (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  tipo text not null default 'simple' check (tipo in ('simple', 'combo')),
  estado text not null default 'propuesto' check (estado in ('propuesto', 'en_revision', 'aprobado')),
  creado_por uuid references auth.users(id),
  aprobado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  aprobado_en timestamptz
);

-- Componentes de un combo: solo tiene sentido cuando skus_maestros.tipo = 'combo'.
create table sku_maestro_componentes (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references skus_maestros(id) on delete cascade,
  componente_id uuid not null references skus_maestros(id),
  cantidad integer not null default 1 check (cantidad > 0),
  unique (combo_id, componente_id),
  check (combo_id <> componente_id)
);

-- Vinculo opcional: que SKU maestro representa este producto especifico de
-- una plataforma. Nullable a proposito, para no romper filas existentes ni
-- forzar la migracion de golpe.
alter table productos add column sku_maestro_id uuid references skus_maestros(id);

alter table skus_maestros enable row level security;
alter table sku_maestro_componentes enable row level security;

create policy "authenticated read/write" on skus_maestros for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on sku_maestro_componentes for all using (auth.role() = 'authenticated');

insert into permisos_rol (rol_id, modulo)
select id, 'catalogo-maestro' from roles where nombre = 'Admin';
