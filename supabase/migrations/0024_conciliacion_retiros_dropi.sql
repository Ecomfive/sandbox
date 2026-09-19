-- Conciliacion de retiros con Dropi: los retiros los crea el equipo, con un
-- correlativo que se reserva al abrir la ventana de crear, y la extraccion de
-- Dropi solo los vincula leyendo ese correlativo (#0007) en el concepto.

-- 1) Lo que Dropi reporta del retiro vinculado, sin tocar el estado propio del
--    retiro (abierto, novedad, cerrado). Nulo = todavia sin vincular.
alter table retiros
  add column if not exists estado_dropi text check (estado_dropi in ('pendiente', 'aprobado', 'rechazado'));

-- 2) Correlativo reservable: pasa de columna identity a una secuencia normal
--    para poder apartar el numero antes de guardar el retiro. Empieza en 1.
alter table retiros alter column numero_correlativo drop identity if exists;
create sequence if not exists retiros_correlativo_seq;
select setval('retiros_correlativo_seq', coalesce((select max(numero_correlativo) from retiros), 0) + 1, false);
alter table retiros alter column numero_correlativo set default nextval('retiros_correlativo_seq');
alter sequence retiros_correlativo_seq owned by retiros.numero_correlativo;
alter table retiros add constraint retiros_numero_correlativo_unico unique (numero_correlativo);

create or replace function reservar_correlativo_retiro() returns bigint
language sql
set search_path = ''
as $$ select nextval('public.retiros_correlativo_seq') $$;

-- Solo el service role (server actions) puede reservar numeros.
revoke execute on function reservar_correlativo_retiro() from public, anon, authenticated;
grant execute on function reservar_correlativo_retiro() to service_role;

-- 3) Retiros que Dropi reporta pero no traen el correlativo de un retiro
--    creado (o el correlativo no existe o ya esta vinculado a otro).
create table dropi_retiros_sin_vincular (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  plataforma_id uuid not null references plataformas(id),
  dropi_id bigint not null,
  monto numeric(12, 2) not null,
  fecha date not null,
  estado_dropi text not null check (estado_dropi in ('pendiente', 'aprobado', 'rechazado')),
  banco text,
  concepto text,
  correlativo bigint,
  motivo text not null check (motivo in ('sin_correlativo', 'no_existe', 'duplicado')),
  actualizado_en timestamptz not null default now(),
  unique (pais_id, plataforma_id, dropi_id)
);

alter table dropi_retiros_sin_vincular enable row level security;
create policy "authenticated read/write" on dropi_retiros_sin_vincular for all using (auth.role() = 'authenticated');
