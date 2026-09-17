-- Usuarios, roles y permisos por módulo.
-- Los usuarios se crean por invitación (Supabase Auth); esta tabla guarda
-- el perfil visible en la app y a qué rol pertenece cada quien.

create table roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  creado_en timestamptz not null default now()
);

-- Un módulo se identifica por su "clave" (ver src/lib/modulos.ts), no por id,
-- para que agregar un módulo nuevo en código no requiera otra migración.
create table permisos_rol (
  id uuid primary key default gen_random_uuid(),
  rol_id uuid not null references roles(id) on delete cascade,
  modulo text not null,
  unique (rol_id, modulo)
);

create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text,
  rol_id uuid references roles(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table roles enable row level security;
alter table permisos_rol enable row level security;
alter table perfiles enable row level security;

create policy "authenticated read/write" on roles for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on permisos_rol for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on perfiles for all using (auth.role() = 'authenticated');

-- Rol Admin con acceso a todos los módulos existentes hoy.
insert into roles (nombre) values ('Admin');
insert into permisos_rol (rol_id, modulo)
select (select id from roles where nombre = 'Admin'), modulo
from unnest(array[
  'dashboard', 'inventario', 'alertas', 'extractos', 'conciliaciones',
  'productos', 'retiros', 'gastos', 'usuarios'
]) as modulo;
