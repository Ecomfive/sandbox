-- Portal AF4 360°: préstamos del grupo (Tesorería › Préstamos del grupo, 17 nov 2026, pedido de Alex).
--
-- Lo que se deben las empresas del grupo entre sí (Panamá, Costa Rica, México, Venezuela…), lo que deben a Alcides (pagos
-- con su tarjeta, préstamos) y a los financistas que fondean órdenes de compra (Ortoped&Co SPA: 20 % por ciclo). Hasta hoy
-- vivía en listas de ClickUp («Préstamos a Costa Rica», «Préstamos a México», «Financiamientos Ortoped»).
--
--  * `fin_grupo_partes`: quién presta o debe (una empresa del grupo, un socio o un financista).
--  * `fin_grupo_movimientos`: un libro por par acreedor → deudor. `prestamo` y `costo` (comisión, interés, retorno del
--    financista, diferencia de cambio) suben la deuda; `abono` la baja. `vence` es cuándo hay que pagarlo; `ordenes` son los
--    códigos de las órdenes de compra que fondeó (así su costo financiero puede sumarse al costo final del producto).
--    El saldo, lo que vence y el costo financiero los calcula `src/lib/finanzas/prestamos-grupo.ts`.
--  * Alerta `prestamo_grupo_vence` (vencido o vence en 7 días).
--
-- RLS activado y sin políticas (SEGURIDAD.md). Se puede correr dos veces. Reversa: supabase/rollbacks/0983_rollback.sql.

create table if not exists fin_grupo_partes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  clase text not null check (clase in ('empresa', 'socio', 'financista')),
  entidad_id uuid references fin_entidades(id),
  activo boolean not null default true,
  orden integer not null default 100,
  creado_en timestamptz not null default now()
);
create unique index if not exists fin_grupo_partes_nombre on fin_grupo_partes (lower(btrim(nombre)));
alter table fin_grupo_partes enable row level security;

insert into fin_grupo_partes (nombre, clase, entidad_id, orden)
select v.nombre, v.clase, (select e.id from fin_entidades e where e.codigo = v.codigo), v.orden
from (values
  ('Ecomfive Panamá', 'empresa', 'PA', 10),
  ('Ecomfive Costa Rica', 'empresa', 'CR', 20),
  ('Ecomfive México', 'empresa', 'MX', 30),
  ('Ecomfive Venezuela', 'empresa', null, 40),
  ('Alcides', 'socio', null, 60),
  ('Ortoped&Co SPA', 'financista', null, 80)
) as v(nombre, clase, codigo, orden)
on conflict do nothing;

create table if not exists fin_grupo_movimientos (
  id uuid primary key default gen_random_uuid(),
  acreedor_id uuid not null references fin_grupo_partes(id),
  deudor_id uuid not null references fin_grupo_partes(id),
  tipo text not null check (tipo in ('prestamo', 'costo', 'abono')),
  fecha date not null,
  vence date,
  -- En dólares (todo lo del grupo se presta en USD). Siempre positivo: el tipo dice si sube o baja.
  monto numeric(14, 2) not null check (monto > 0),
  concepto text not null check (char_length(btrim(concepto)) between 1 and 300),
  ordenes text[] not null default '{}',
  -- Cómo se movió la plata: transferencia, tarjeta de Alcides, Payoneer, pago de órdenes…
  medio text check (medio is null or char_length(medio) <= 60),
  nota text check (nota is null or char_length(nota) <= 1000),
  origen text not null default 'manual' check (origen in ('manual', 'clickup')),
  origen_clave text unique,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  check (acreedor_id <> deudor_id),
  check (vence is null or vence >= fecha)
);
create index if not exists fin_grupo_mov_par on fin_grupo_movimientos (acreedor_id, deudor_id, fecha);
create index if not exists fin_grupo_mov_vence on fin_grupo_movimientos (vence) where vence is not null;
alter table fin_grupo_movimientos enable row level security;

-- Alerta de vencimientos: el check de fin_alertas con la lista de 0980 + prestamo_grupo_vence.
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
    'prestamo_grupo_vence'
  )) not valid;
end $$;
