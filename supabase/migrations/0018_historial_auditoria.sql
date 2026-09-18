-- Registro de quien hizo cada cambio en operaciones sensibles (retiros,
-- margenes de productos), relevante al tener varios usuarios con rol Admin.

create table historial_auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id),
  usuario_nombre text,
  accion text not null,
  entidad text not null,
  entidad_id text,
  detalle text,
  creado_en timestamptz not null default now()
);

alter table historial_auditoria enable row level security;
create policy "authenticated read/write" on historial_auditoria for all using (auth.role() = 'authenticated');
