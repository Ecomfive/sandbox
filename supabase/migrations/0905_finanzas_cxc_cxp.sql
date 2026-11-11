-- Portal AF4 360° — Cuentas por cobrar y Cuentas por pagar (reemplaza las hojas «CPC», « CPP» y «CPP CALZADOS O. VZLA»
-- de GASTOS_PANAMA_2026.xlsx; ver FINANZAS-360.md).
--
-- Un documento (factura, deuda, préstamo) por cobrar o por pagar y sus abonos. El saldo = monto − abonos y el estado
-- sale del saldo (pendiente / parcial / pagado), salvo «incobrable» o «anulado», que se marcan a mano. La misma regla
-- vive en `src/lib/finanzas/cxc-cxp.ts`: si cambias una, cambia la otra.
--
-- `fin_cartera_al(fecha)` da los totales a una fecha de corte (por cobrar, por pagar, vencido y antigüedad, por tienda):
-- es lo que leen el Estado de resultados / capital de trabajo y el balance de fin de mes. `fin_cartera_totales` es lo
-- mismo a hoy (hora de Panamá).
--
-- RLS activado y sin políticas (ver SEGURIDAD.md): solo el servidor, con la clave de servicio, toca estas tablas.
-- Las vistas llevan `security_invoker = true` para no saltarse ese RLS. Se puede correr dos veces.

create table if not exists fin_cartera (
  id uuid primary key default gen_random_uuid(),
  -- cobrar: nos deben (CPC) · pagar: debemos (CPP)
  clase text not null check (clase in ('cobrar', 'pagar')),
  contraparte text not null check (length(trim(contraparte)) > 0),
  -- Tienda o unidad a la que corresponde, si se sabe.
  unidad_id uuid references fin_unidades(id),
  documento text,
  -- Emisión (o fecha de la deuda). Puede faltar: el Excel trae deudas sin fecha.
  fecha date,
  vencimiento date,
  motivo text,
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null default 'USD' check (moneda = 'USD'),
  -- Lo único que no sale del saldo: se marca a mano, con auditoría.
  estado_manual text check (estado_manual in ('incobrable', 'anulado')),
  motivo_estado text,
  notas text,
  -- Lo que traía el Excel (observaciones, país, envío…); el portal no lo pisa al editar.
  notas_excel text,
  -- 'manual' (portal) o 'excel'. La clave hace idempotente la importación; la hoja acota qué se borra al reimportar.
  origen text not null default 'manual' check (origen in ('manual', 'excel')),
  origen_archivo text,
  origen_hoja text,
  origen_clave text unique,
  -- Cambiado en el portal (tienda): reimportar el Excel no lo pisa.
  editado_a_mano boolean not null default false,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create index if not exists fin_cartera_clase on fin_cartera (clase, fecha);
create index if not exists fin_cartera_contraparte on fin_cartera (clase, contraparte);

create table if not exists fin_cartera_abonos (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references fin_cartera(id) on delete cascade,
  -- Puede faltar: el Excel trae abonos sin fecha (ABONO 1/2/3 de la CPC).
  fecha date,
  monto numeric(14, 2) not null check (monto > 0),
  metodo text,
  referencia text,
  -- La cuenta (banco, tarjeta, Binance) por donde entró o salió el dinero, si se sabe.
  cuenta_id uuid references fin_cuentas(id),
  notas text,
  origen text not null default 'manual' check (origen in ('manual', 'excel')),
  origen_clave text unique,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id)
);

create index if not exists fin_cartera_abonos_documento on fin_cartera_abonos (documento_id);

alter table fin_cartera enable row level security;
alter table fin_cartera_abonos enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Saldo y estado de cada documento (a hoy)
-- ---------------------------------------------------------------------------------------------
-- Plazo cuando el documento no trae vencimiento: 30 días desde la emisión (`PLAZO_PREDETERMINADO`).
create or replace function fin_cartera_hoy() returns date
language sql stable as $$ select (now() at time zone 'America/Panama')::date $$;

create or replace view fin_cartera_saldos
with (security_invoker = true) as
with abonado as (
  select documento_id, sum(monto) as abonado, count(*) as abonos, max(fecha) as ultimo_abono
  from fin_cartera_abonos
  group by 1
),
base as (
  select
    d.*,
    coalesce(a.abonado, 0)::numeric(14, 2) as abonado,
    coalesce(a.abonos, 0) as abonos,
    a.ultimo_abono,
    (d.monto - coalesce(a.abonado, 0))::numeric(14, 2) as saldo,
    coalesce(d.vencimiento, d.fecha + 30) as vencimiento_efectivo
  from fin_cartera d
  left join abonado a on a.documento_id = d.id
),
con_estado as (
  select
    b.*,
    case
      when b.estado_manual is not null then b.estado_manual
      when b.saldo <= 0.005 then 'pagado'
      when b.abonado > 0.005 then 'parcial'
      else 'pendiente'
    end as estado,
    case when b.fecha is null then null else greatest(fin_cartera_hoy() - b.fecha, 0) end as dias
  from base b
)
select
  e.*,
  case
    when e.dias is null then 'sin-fecha'
    when e.dias <= 30 then '0-30'
    when e.dias <= 60 then '31-60'
    when e.dias <= 90 then '61-90'
    else '90+'
  end as tramo,
  coalesce(e.estado in ('pendiente', 'parcial') and e.vencimiento_efectivo < fin_cartera_hoy(), false) as vencido
from con_estado e;

-- ---------------------------------------------------------------------------------------------
-- Totales a una fecha de corte (para el EERR / capital de trabajo y el balance de fin de mes)
-- ---------------------------------------------------------------------------------------------
-- Cuenta los documentos emitidos hasta el corte (o sin fecha) y los abonos hechos hasta el corte (o sin fecha). Lo
-- anulado no cuenta; lo incobrable va aparte (`incobrable`). Una fila por cartera y tienda (unidad_id null = sin tienda).
create or replace function fin_cartera_al(p_corte date default null)
returns table (
  clase text,
  unidad_id uuid,
  documentos bigint,
  saldo numeric,
  vencido numeric,
  tramo_0_30 numeric,
  tramo_31_60 numeric,
  tramo_61_90 numeric,
  tramo_90_mas numeric,
  sin_fecha numeric,
  incobrable numeric
)
language sql stable
set search_path = public
as $$
  with corte as (select coalesce(p_corte, fin_cartera_hoy()) as dia),
  docs as (
    select
      d.clase,
      d.unidad_id,
      d.fecha,
      d.estado_manual,
      coalesce(d.vencimiento, d.fecha + 30) as vence,
      d.monto - coalesce((
        select sum(a.monto) from fin_cartera_abonos a
        where a.documento_id = d.id and (a.fecha is null or a.fecha <= (select dia from corte))
      ), 0) as saldo
    from fin_cartera d
    where (d.fecha is null or d.fecha <= (select dia from corte))
      and d.estado_manual is distinct from 'anulado'
  ),
  vivos as (
    select docs.*, case when fecha is null then null else (select dia from corte) - fecha end as dias
    from docs
    where saldo > 0.005
  )
  select
    v.clase,
    v.unidad_id,
    count(*) filter (where v.estado_manual is null),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.vence < (select dia from corte)), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.dias <= 30), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.dias between 31 and 60), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.dias between 61 and 90), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.dias > 90), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.dias is null), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual = 'incobrable'), 0), 2)
  from vivos v
  group by v.clase, v.unidad_id
$$;

-- A hoy, por cartera y tienda.
create or replace view fin_cartera_totales
with (security_invoker = true) as
select * from fin_cartera_al(null);

-- Las funciones solo las llama el servidor (clave de servicio).
revoke all on function fin_cartera_al(date) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_cartera_al(date) from anon, authenticated';
  end if;
end $$;

comment on table fin_cartera is 'Portal AF4 360°: documentos por cobrar (clase cobrar) y por pagar (clase pagar); reemplaza las hojas CPC y CPP.';
comment on table fin_cartera_abonos is 'Portal AF4 360°: abonos de cada documento de fin_cartera.';
comment on view fin_cartera_saldos is 'Portal AF4 360°: cada documento con abonado, saldo, estado, antigüedad (tramo) y vencido, a hoy (Panamá).';
comment on function fin_cartera_al(date) is 'Portal AF4 360°: por cobrar / por pagar, vencido, tramos e incobrable a una fecha de corte, por cartera y tienda.';

-- ---------------------------------------------------------------------------------------------
-- Permisos: los módulos «cuentas-por-cobrar» y «cuentas-por-pagar» los reciben quienes ya tienen el Libro de
-- movimientos, con su mismo solo lectura. Lo demás se da en Usuarios y roles.
-- ---------------------------------------------------------------------------------------------
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, m.modulo, solo_lectura
from permisos_rol
cross join (values ('cuentas-por-cobrar'), ('cuentas-por-pagar')) as m(modulo)
where permisos_rol.modulo = 'libro-movimientos'
on conflict (rol_id, modulo) do nothing;
