-- Esquema núcleo del beta: proveeduría, conciliación de inventario y bancaria.
-- Alcance inicial: Costa Rica y Panamá, plataforma Dropi.

create table paises (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, -- 'CR', 'PA'
  nombre text not null
);

create table plataformas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique -- 'Dropi', 'EFI', 'Boxful'
);

-- Cuentas de extracción por país/plataforma. Solo metadata: las credenciales
-- viven en variables de entorno / secret manager, nunca en esta tabla.
create table cuentas_extraccion (
  id uuid primary key default gen_random_uuid(),
  plataforma_id uuid not null references plataformas(id),
  pais_id uuid references paises(id),
  tipo text not null check (tipo in ('proveedor', 'dropshipper')),
  etiqueta text not null,
  activa boolean not null default true
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  plataforma_id uuid not null references plataformas(id),
  sku text not null,
  nombre text not null,
  costo numeric(12, 2),
  precio_actual numeric(12, 2),
  margen_minimo numeric(5, 2) not null default 30,
  ultima_modificacion_precio date,
  unique (pais_id, plataforma_id, sku)
);

-- Reportes crudos de Dropi (cuenta proveedor) antes de normalizar.
create table staging_ordenes_dropi (
  id uuid primary key default gen_random_uuid(),
  cuenta_extraccion_id uuid not null references cuentas_extraccion(id),
  payload jsonb not null,
  procesado boolean not null default false,
  creado_en timestamptz not null default now()
);

create table ordenes (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  plataforma_id uuid not null references plataformas(id),
  producto_id uuid references productos(id),
  referencia_externa text not null,
  cantidad integer not null,
  monto numeric(12, 2) not null,
  estado text not null,
  fecha date not null,
  unique (plataforma_id, referencia_externa)
);

create table movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  producto_id uuid not null references productos(id),
  tipo text not null check (tipo in ('entrada', 'salida')),
  cantidad integer not null,
  fuente text not null check (fuente in ('pistoleo', 'plataforma', 'manual')),
  referencia text,
  fecha date not null,
  creado_en timestamptz not null default now()
);

-- Extractos bancarios cargados manualmente (archivo en Supabase Storage).
create table extractos_bancarios (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  archivo_path text not null,
  fecha_carga timestamptz not null default now(),
  subido_por uuid references auth.users(id)
);

create table movimientos_bancarios (
  id uuid primary key default gen_random_uuid(),
  extracto_id uuid not null references extractos_bancarios(id),
  fecha date not null,
  monto numeric(12, 2) not null,
  descripcion text,
  tipo text not null check (tipo in ('deposito', 'retiro')),
  conciliado boolean not null default false
);

create table conciliaciones (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  plataforma_id uuid not null references plataformas(id),
  periodo date not null, -- primer día del mes que concilia
  monto_reportado_plataforma numeric(12, 2) not null default 0,
  monto_bancario numeric(12, 2) not null default 0,
  diferencia numeric(12, 2) generated always as (monto_bancario - monto_reportado_plataforma) stored,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'resuelta')),
  notas text,
  unique (pais_id, plataforma_id, periodo)
);

create table alertas_inventario_no_retornado (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  producto_id uuid not null references productos(id),
  cantidad integer not null,
  fecha_deteccion date not null default current_date,
  fecha_reclamo date,
  estado text not null default 'abierta' check (estado in ('abierta', 'reclamada', 'resuelta'))
);

-- RLS: acceso solo para usuarios autenticados en esta fase (equipo interno).
-- Las extracciones automatizadas usan la service role key, que ignora RLS.
alter table paises enable row level security;
alter table plataformas enable row level security;
alter table cuentas_extraccion enable row level security;
alter table productos enable row level security;
alter table ordenes enable row level security;
alter table movimientos_inventario enable row level security;
alter table extractos_bancarios enable row level security;
alter table movimientos_bancarios enable row level security;
alter table conciliaciones enable row level security;
alter table alertas_inventario_no_retornado enable row level security;

create policy "authenticated read/write" on paises for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on plataformas for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on cuentas_extraccion for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on productos for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on ordenes for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on movimientos_inventario for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on extractos_bancarios for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on movimientos_bancarios for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on conciliaciones for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on alertas_inventario_no_retornado for all using (auth.role() = 'authenticated');

insert into paises (codigo, nombre) values ('CR', 'Costa Rica'), ('PA', 'Panamá');
insert into plataformas (nombre) values ('Dropi'), ('EFI'), ('Boxful');
