-- Portal AF4 360°: Tesorería › Deuda (/tesoreria/deuda). Líneas de crédito y préstamos con tabla de amortización
-- (sistema francés: cuota fija). La lógica vive en `src/lib/finanzas/deuda.ts` (misma fórmula que aquí, con prueba).
--
--  * `fin_lineas_credito`: cupo, usado (a mano, con la fecha del dato), tasa anual y fecha de renovación.
--  * `fin_prestamos`: monto, tasa anual, plazo en meses, primer vencimiento (las cuotas siguen mes a mes ese día) y el
--    tipo del libro con que se registra la cuota (para no contarla dos veces como gasto recurrente en la proyección).
--  * `fin_deuda_al(corte)`: el saldo de cada préstamo y línea a una fecha, separado en corriente (lo que vence en los 12
--    meses siguientes) y no corriente. Las cuotas se dan por pagadas en su fecha. Es lo que lee el balance general.
--  * `fin_prestamos_saldos`: la misma función al día de hoy, como vista.
--
-- RLS activado y sin políticas (SEGURIDAD.md); la vista con `security_invoker = true`; la función solo la llama el
-- servidor. Se puede correr dos veces.

create table if not exists fin_lineas_credito (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  banco text check (banco is null or length(banco) <= 120),
  cupo numeric(14, 2) not null check (cupo > 0),
  usado numeric(14, 2) not null default 0 check (usado >= 0),
  -- La fecha del saldo usado (desde cuándo cuenta en el balance).
  usado_al date not null default ((now() at time zone 'America/Panama')::date),
  -- Fracción anual: 0.12 = 12 %.
  tasa_anual numeric(8, 6) not null default 0 check (tasa_anual >= 0 and tasa_anual < 2),
  fecha_renovacion date,
  cuenta_id uuid references fin_cuentas(id),
  activo boolean not null default true,
  nota text check (nota is null or length(nota) <= 1000),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table fin_lineas_credito enable row level security;

create table if not exists fin_prestamos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  acreedor text check (acreedor is null or length(acreedor) <= 120),
  clase text not null default 'prestamo' check (clase in ('prestamo', 'financiamiento', 'leasing')),
  monto numeric(14, 2) not null check (monto > 0),
  tasa_anual numeric(8, 6) not null default 0 check (tasa_anual >= 0 and tasa_anual < 2),
  plazo_meses integer not null check (plazo_meses between 1 and 480),
  fecha_desembolso date not null,
  primer_vencimiento date not null,
  tipo_id uuid references fin_tipos(id),
  cuenta_id uuid references fin_cuentas(id),
  activo boolean not null default true,
  nota text check (nota is null or length(nota) <= 1000),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (primer_vencimiento >= fecha_desembolso)
);
alter table fin_prestamos enable row level security;

-- La fecha de la cuota k (1…n): el primer vencimiento + (k − 1) meses (Postgres recorta al último día del mes).
create or replace function fin_cuota_fecha(p_primer date, p_k integer) returns date
language sql immutable as $$ select (p_primer + make_interval(months => p_k - 1))::date $$;

-- Saldo de un préstamo francés después de k cuotas.
create or replace function fin_saldo_frances(p_monto numeric, p_tasa_anual numeric, p_n integer, p_k integer) returns numeric
language sql immutable as $$
  with v as (select p_tasa_anual / 12 as i, least(greatest(p_k, 0), p_n) as k)
  select case
    when (select k from v) >= p_n then 0
    when (select i from v) = 0 then round(p_monto - p_monto / p_n * (select k from v), 2)
    else round(
      p_monto * power(1 + (select i from v), (select k from v))
      - (p_monto * (select i from v) / (1 - power(1 + (select i from v), -p_n))) * (power(1 + (select i from v), (select k from v)) - 1) / (select i from v),
      2
    )
  end
$$;

create or replace function fin_deuda_al(p_corte date default null)
returns table (
  origen text,
  id uuid,
  nombre text,
  acreedor text,
  saldo numeric,
  corriente numeric,
  no_corriente numeric,
  cuotas_pagadas integer,
  cuotas integer
)
language sql stable
set search_path = public
as $$
  with c as (select coalesce(p_corte, (now() at time zone 'America/Panama')::date) as dia),
  p as (
    select
      pr.*,
      (select count(*)::integer from generate_series(1, pr.plazo_meses) k where fin_cuota_fecha(pr.primer_vencimiento, k) <= (select dia from c)) as k,
      (select count(*)::integer from generate_series(1, pr.plazo_meses) k where fin_cuota_fecha(pr.primer_vencimiento, k) <= ((select dia from c) + interval '12 months')::date) as k12
    from fin_prestamos pr
    where pr.activo and pr.fecha_desembolso <= (select dia from c)
  )
  select
    'prestamo'::text,
    p.id,
    p.nombre,
    p.acreedor,
    fin_saldo_frances(p.monto, p.tasa_anual, p.plazo_meses, p.k),
    fin_saldo_frances(p.monto, p.tasa_anual, p.plazo_meses, p.k) - fin_saldo_frances(p.monto, p.tasa_anual, p.plazo_meses, p.k12),
    fin_saldo_frances(p.monto, p.tasa_anual, p.plazo_meses, p.k12),
    p.k,
    p.plazo_meses
  from p
  where fin_saldo_frances(p.monto, p.tasa_anual, p.plazo_meses, p.k) > 0
  union all
  select 'linea'::text, l.id, l.nombre, l.banco, l.usado, l.usado, 0::numeric, null::integer, null::integer
  from fin_lineas_credito l
  where l.activo and l.usado > 0 and l.usado_al <= (select dia from c)
$$;

create or replace view fin_prestamos_saldos
with (security_invoker = true) as
select * from fin_deuda_al(null);

do $$
declare
  f text;
begin
  foreach f in array array['fin_deuda_al(date)', 'fin_saldo_frances(numeric, numeric, integer, integer)', 'fin_cuota_fecha(date, integer)'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon, authenticated', f);
    end if;
  end loop;
end $$;

comment on table fin_lineas_credito is 'Portal AF4 360°: líneas de crédito (cupo, usado, tasa, renovación).';
comment on table fin_prestamos is 'Portal AF4 360°: préstamos y financiamientos con amortización francesa.';
comment on function fin_deuda_al(date) is 'Portal AF4 360°: deuda financiera a una fecha (préstamos y líneas), corriente y no corriente, para el balance.';
comment on view fin_prestamos_saldos is 'Portal AF4 360°: deuda financiera al día de hoy (fin_deuda_al).';
