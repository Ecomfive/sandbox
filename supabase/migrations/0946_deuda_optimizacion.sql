-- Portal AF4 360°: Tesorería › Optimizar deuda, Refinanciamiento y Covenants (mejoras 18, 19 y 20 del «CFO en línea»).
--
--  * `fin_financiamientos_ciclo`: los giros a un proveedor o financista que cobran un costo por ciclo (p. ej. 20 % cada 70
--    días). Monto vigente, tasa por ciclo, días del ciclo, fecha del primer giro (los ciclos vencen cada N días desde ahí) y
--    si se renueva (al vencer se paga solo el costo) o no (al vencer se paga todo). La lógica vive en
--    `src/lib/finanzas/deuda.ts` (`vencimientosCiclo`, `tasaEfectivaAnualCiclo`), con prueba.
--  * Penalidad (fracción de lo prepagado) y comisión fija de prepago en préstamos, líneas y giros: las usa el optimizador.
--  * `fin_deuda_al(corte)` suma los giros vigentes (todo corriente), así entran al balance general y al paquete bancario.
--  * `fin_ofertas_refinanciamiento`: ofertas bancarias para simular (monto, plazo, tasa, comisión de apertura, gracia,
--    garantías y qué deudas sustituye, como «ciclo:<id>»).
--  * `fin_covenants`: covenants por préstamo, línea, giro, oferta o de toda la empresa (indicador y umbral).
--
-- RLS activado y sin políticas (SEGURIDAD.md): solo el servidor, con la clave de servicio. Se puede correr dos veces.

create table if not exists fin_financiamientos_ciclo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  acreedor text check (acreedor is null or length(acreedor) <= 120),
  monto numeric(14, 2) not null check (monto > 0),
  -- Fracción por ciclo: 0.2 = 20 %.
  tasa_ciclo numeric(8, 6) not null check (tasa_ciclo >= 0 and tasa_ciclo < 2),
  dias_ciclo integer not null check (dias_ciclo between 1 and 730),
  fecha_inicio date not null,
  renovable boolean not null default true,
  penalidad_prepago numeric(8, 6) not null default 0 check (penalidad_prepago >= 0 and penalidad_prepago < 1),
  comision_prepago numeric(14, 2) not null default 0 check (comision_prepago >= 0),
  cuenta_id uuid references fin_cuentas(id),
  activo boolean not null default true,
  nota text check (nota is null or length(nota) <= 1000),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table fin_financiamientos_ciclo enable row level security;

alter table fin_prestamos add column if not exists penalidad_prepago numeric(8, 6) not null default 0;
alter table fin_prestamos add column if not exists comision_prepago numeric(14, 2) not null default 0;
alter table fin_lineas_credito add column if not exists penalidad_prepago numeric(8, 6) not null default 0;
alter table fin_lineas_credito add column if not exists comision_prepago numeric(14, 2) not null default 0;

create table if not exists fin_ofertas_refinanciamiento (
  id uuid primary key default gen_random_uuid(),
  banco text not null check (length(btrim(banco)) between 1 and 120),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  monto numeric(14, 2) not null check (monto > 0),
  plazo_meses integer not null check (plazo_meses between 1 and 480),
  tasa_anual numeric(8, 6) not null check (tasa_anual >= 0 and tasa_anual < 2),
  comision_apertura numeric(8, 6) not null default 0 check (comision_apertura >= 0 and comision_apertura < 1),
  gracia_meses integer not null default 0 check (gracia_meses between 0 and 60),
  garantias text check (garantias is null or length(garantias) <= 1000),
  fecha_desembolso date not null,
  -- Refs de las deudas que paga: «prestamo:<id>», «linea:<id>», «ciclo:<id>».
  sustituye text[] not null default '{}',
  activo boolean not null default true,
  nota text check (nota is null or length(nota) <= 1000),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (gracia_meses < plazo_meses)
);
alter table fin_ofertas_refinanciamiento enable row level security;

create table if not exists fin_covenants (
  id uuid primary key default gen_random_uuid(),
  ambito text not null default 'general' check (ambito in ('general', 'prestamo', 'linea', 'ciclo', 'oferta')),
  -- El préstamo, la línea, el giro o la oferta (null = toda la empresa).
  ref_id uuid,
  indicador text not null check (indicador in ('deuda_ebitda_max', 'cobertura_min', 'liquidez_min', 'patrimonio_min', 'capital_trabajo_min')),
  umbral numeric(16, 4) not null,
  activo boolean not null default true,
  nota text check (nota is null or length(nota) <= 500),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  check ((ambito = 'general') = (ref_id is null))
);
alter table fin_covenants enable row level security;
create index if not exists fin_covenants_ref_idx on fin_covenants (ambito, ref_id) where activo;

-- La deuda a una fecha, ahora con los giros (misma firma y columnas que en la 0145).
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
  union all
  select 'ciclo'::text, f.id, f.nombre, f.acreedor, f.monto, f.monto, 0::numeric, null::integer, null::integer
  from fin_financiamientos_ciclo f
  where f.activo
    and f.fecha_inicio <= (select dia from c)
    and (f.renovable or f.fecha_inicio + f.dias_ciclo > (select dia from c))
$$;

create or replace view fin_prestamos_saldos
with (security_invoker = true) as
select * from fin_deuda_al(null);

do $$
begin
  revoke all on function fin_deuda_al(date) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function fin_deuda_al(date) from anon, authenticated;
  end if;
end $$;

comment on table fin_financiamientos_ciclo is 'Portal AF4 360°: financiamientos por ciclo (giros con costo por ciclo de N días).';
comment on table fin_ofertas_refinanciamiento is 'Portal AF4 360°: ofertas bancarias para el simulador de refinanciamiento.';
comment on table fin_covenants is 'Portal AF4 360°: covenants por préstamo, línea, giro, oferta o de toda la empresa.';
