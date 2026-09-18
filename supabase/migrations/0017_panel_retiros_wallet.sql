-- Panel de gestion de retiros de wallet: catalogo de cuentas de destino,
-- ciclo de vida completo del retiro (abierto -> cerrado/cancelado/novedad)
-- con conciliacion automatica entre el monto neto esperado y el monto
-- realmente recibido, y un historial de eventos por retiro.

create table cuentas_retiro (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  tipo text not null check (tipo in ('banco', 'binance', 'tarjeta', 'otro')),
  nombre text not null,
  detalle text,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table cuentas_retiro enable row level security;
create policy "authenticated read/write" on cuentas_retiro for all using (auth.role() = 'authenticated');

-- El correlativo es solo para los retiros creados desde este panel; los que
-- ya existian (traidos de Dropi) no tienen un numero propio del sistema.
alter table retiros add column numero_correlativo bigint generated always as identity;
alter table retiros add column cuenta_retiro_id uuid references cuentas_retiro(id);
alter table retiros add column comision numeric(12, 2) not null default 0;
alter table retiros add column monto_neto numeric(12, 2) generated always as (monto - comision) stored;
alter table retiros add column soporte_numero text;
alter table retiros add column comprobante_path text;
alter table retiros add column monto_recibido numeric(12, 2);
alter table retiros add column fecha_cierre date;

-- Los retiros ya existentes (manuales y los traidos de Dropi) usaban un
-- vocabulario mas simple; se remapean al nuevo ciclo de vida del panel.
alter table retiros drop constraint retiros_estado_check;
update retiros set estado = 'cerrado' where estado = 'procesado';
update retiros set estado = 'cancelado' where estado = 'rechazado';
update retiros set estado = 'abierto' where estado = 'solicitado';
alter table retiros add constraint retiros_estado_check check (estado in ('abierto', 'cancelado', 'novedad', 'cerrado'));
alter table retiros alter column estado set default 'abierto';

create table retiro_eventos (
  id uuid primary key default gen_random_uuid(),
  retiro_id uuid not null references retiros(id) on delete cascade,
  evento text not null,
  creado_en timestamptz not null default now()
);

alter table retiro_eventos enable row level security;
create policy "authenticated read/write" on retiro_eventos for all using (auth.role() = 'authenticated');

-- Comprobantes de pago: bucket privado, el acceso pasa siempre por el
-- service role (server actions / server components), igual que
-- extractos-bancarios.
insert into storage.buckets (id, name, public)
values ('comprobantes-retiro', 'comprobantes-retiro', false)
on conflict (id) do nothing;
