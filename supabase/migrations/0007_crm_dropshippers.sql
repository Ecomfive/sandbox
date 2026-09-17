-- CRM de dropshippers: directorio y bitácora de comunicación.
-- El volumen de ventas se ingresa a mano hasta que las órdenes de Dropi
-- estén conectadas a la base de datos.

create table dropshippers (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  nombre text not null,
  contacto_email text,
  contacto_telefono text,
  estado text not null default 'prospecto' check (estado in ('prospecto', 'activo', 'inactivo')),
  volumen_mensual_estimado numeric(12, 2),
  notas text,
  creado_en timestamptz not null default now()
);

create table interacciones_dropshipper (
  id uuid primary key default gen_random_uuid(),
  dropshipper_id uuid not null references dropshippers(id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('llamada', 'whatsapp', 'email', 'reunion', 'otro')),
  nota text not null,
  creado_en timestamptz not null default now()
);

alter table dropshippers enable row level security;
alter table interacciones_dropshipper enable row level security;

create policy "authenticated read/write" on dropshippers for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on interacciones_dropshipper for all using (auth.role() = 'authenticated');

-- El rol Admin ya sembrado en 0006 también obtiene este módulo nuevo.
insert into permisos_rol (rol_id, modulo)
select id, 'crm-dropshippers' from roles where nombre = 'Admin';
