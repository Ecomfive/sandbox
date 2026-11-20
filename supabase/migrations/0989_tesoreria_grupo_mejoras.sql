-- 0989 · Tesorería y préstamos del grupo (lista de 100 mejoras, 52 y 61 a 70; 19 nov 2026). Reversa: supabase/rollbacks/0989_rollback.sql.
--
-- 1. `fin_grupo_movimientos.naturaleza` ('deuda' | 'aporte') y `soporte`: un préstamo de un socio puede ser un aporte de
--    capital (no es deuda: no suma al saldo ni vence) y se anota con qué se respalda (contrato, acta, transferencia).
-- 2. `origen` admite 'sistema': lo que crea el portal (interés entre empresas, neteo).
-- 3. `fin_grupo_pares`: la tasa anual que cobra una empresa a otra (si se decide cobrarla). Con ella el portal calcula el
--    interés del mes sobre el saldo de cada día y lo registra como un costo.
-- 4. `fin_grupo_confirmaciones`: lo que dice cada empresa que le debe la otra a una fecha de corte, para compararlo con el
--    saldo del portal.
-- 5. Alerta `caja_minima_empresa`: el saldo de caja de una empresa (bancos y billeteras, en USD) bajo o cerca de su
--    mínimo (`fin_config.caja_minima_empresas` = { entidad_id: monto }).
-- RLS activado y sin políticas. Se puede correr dos veces.

alter table fin_grupo_movimientos add column if not exists naturaleza text not null default 'deuda' check (naturaleza in ('deuda', 'aporte'));
alter table fin_grupo_movimientos add column if not exists soporte text check (soporte is null or char_length(soporte) <= 300);

do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'fin_grupo_movimientos'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%origen%'
  loop
    execute format('alter table fin_grupo_movimientos drop constraint %I', r.conname);
  end loop;
  alter table fin_grupo_movimientos add constraint fin_grupo_movimientos_origen_check check (origen in ('manual', 'clickup', 'libro', 'sistema'));
end $$;

create table if not exists fin_grupo_pares (
  acreedor_id uuid not null references fin_grupo_partes(id) on delete cascade,
  deudor_id uuid not null references fin_grupo_partes(id) on delete cascade,
  -- Tasa anual simple (0.12 = 12 %).
  tasa_anual numeric(8, 6) not null check (tasa_anual >= 0 and tasa_anual <= 5),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  primary key (acreedor_id, deudor_id),
  check (acreedor_id <> deudor_id)
);
alter table fin_grupo_pares enable row level security;

create table if not exists fin_grupo_confirmaciones (
  id uuid primary key default gen_random_uuid(),
  acreedor_id uuid not null references fin_grupo_partes(id) on delete cascade,
  deudor_id uuid not null references fin_grupo_partes(id) on delete cascade,
  fecha_corte date not null,
  -- Lo que dice cada empresa que le debe la otra (null = no respondió).
  saldo_acreedor numeric(14, 2),
  saldo_deudor numeric(14, 2),
  nota text check (nota is null or char_length(nota) <= 500),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  check (acreedor_id <> deudor_id),
  check (saldo_acreedor is not null or saldo_deudor is not null)
);
create index if not exists fin_grupo_conf_par on fin_grupo_confirmaciones (acreedor_id, deudor_id, fecha_corte desc);
alter table fin_grupo_confirmaciones enable row level security;

insert into fin_config (clave, valor) values ('caja_minima_empresas', '{}'::jsonb) on conflict (clave) do nothing;

do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'fin_alertas'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%tipo%'
  loop
    execute format('alter table fin_alertas drop constraint %I', r.conname);
  end loop;
  alter table fin_alertas add constraint fin_alertas_tipo_check check (tipo in (
    'caja_minima', 'cxp_vence', 'cxc_vencido', 'cierre_pendiente', 'costo_ventas', 'inventario_sin_costo',
    'cierre_tarea_atrasada', 'fiscal_vence',
    'tesoreria_dropi', 'tesoreria_efectivo', 'tesoreria_depositos', 'tesoreria_linea_vencida', 'tesoreria_linea_renovar',
    'tesoreria_linea_uso', 'tesoreria_saldos', 'tesoreria_pagos',
    'pauta_techo',
    'tesoreria_covenant',
    'riesgo_sube',
    'presupuesto_desvio',
    'gasto_anomalo',
    'prestamo_grupo_vence',
    'conciliacion_atrasada',
    'costo_sube',
    'caja_minima_empresa'
  )) not valid;
end $$;

comment on table fin_grupo_pares is 'Portal AF4 360°: tasa anual entre empresas del grupo (migración 0989).';
comment on table fin_grupo_confirmaciones is 'Portal AF4 360°: saldos que confirma cada empresa del grupo a una fecha de corte (migración 0989).';
