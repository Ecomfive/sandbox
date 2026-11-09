-- Portal AF4 360°: Balance general (/balance-general, mejora 25 de «Estados financieros»).
--
-- El balance de cada mes de corte se arma en el portal con lo que ya existe: caja y bancos (flujo + saldos iniciales),
-- cuentas por cobrar y por pagar (`fin_cartera_al`), bienes de uso netos de depreciación, inventario valorizado,
-- aportes, utilidades acumuladas y retiros. Esta migración agrega lo que faltaba:
--
-- 1. `fin_balance_partidas`: saldos escritos a mano que no salen del libro (préstamos, otros activos y pasivos, aportes
--    iniciales y el patrimonio al empezar el libro). Cada fila es el saldo de un concepto desde el cierre de su mes; el
--    balance de un corte usa la última fila de cada concepto con mes ≤ corte (un préstamo pagado se cierra con 0).
-- 2. `fin_inventario_cortes`: la foto del inventario valorizado al cierre de un mes (el WMS solo sabe el stock de hoy).
-- 3. Permiso del módulo `balance-general` para quien ya tiene el Libro de movimientos (con su mismo solo lectura).
--
-- RLS activado y sin políticas (SEGURIDAD.md). Se puede correr dos veces.

create table if not exists fin_balance_partidas (
  id uuid primary key default gen_random_uuid(),
  -- La empresa del grupo; vacío = la entidad base (Panamá).
  entidad_id uuid references fin_entidades(id),
  rubro text not null check (rubro in ('prestamo', 'otro_activo', 'otro_pasivo', 'aporte_capital', 'patrimonio_inicial')),
  concepto text not null check (length(trim(concepto)) between 1 and 120),
  -- Primer día del mes: el saldo vale desde el cierre de este mes.
  periodo date not null check (extract(day from periodo) = 1),
  -- En dólares.
  monto numeric(16, 2) not null,
  nota text check (nota is null or length(nota) <= 300),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists fin_balance_partidas_unica
  on fin_balance_partidas (coalesce(entidad_id, '00000000-0000-0000-0000-000000000000'::uuid), rubro, lower(trim(concepto)), periodo);

alter table fin_balance_partidas enable row level security;

comment on table fin_balance_partidas is 'Portal AF4 360°: saldos manuales del balance general (préstamos, otros activos y pasivos, aportes y patrimonio inicial), vigentes desde el cierre de su mes.';

create table if not exists fin_inventario_cortes (
  -- Primer día del mes del corte.
  periodo date primary key check (extract(day from periodo) = 1),
  valor numeric(16, 2) not null check (valor >= 0),
  unidades numeric(16, 2),
  origen text not null default 'manual' check (origen in ('manual', 'automatico')),
  tomado_por uuid references auth.users(id),
  tomado_en timestamptz not null default now()
);

alter table fin_inventario_cortes enable row level security;

comment on table fin_inventario_cortes is 'Portal AF4 360°: valor del inventario (fin_inventario_valorizado, Panamá) al cierre de cada mes, para el balance general y el flujo indirecto.';

insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'balance-general', solo_lectura
from permisos_rol
where modulo = 'libro-movimientos'
on conflict (rol_id, modulo) do nothing;
