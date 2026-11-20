-- 0986 · Mejoras del libro y la conciliación (lista de 100 mejoras, 19 nov 2026). Reversa: supabase/rollbacks/0986_rollback.sql.
--
-- 1. `fin_movimientos.nota_interna`: una nota de Finanzas por movimiento (no sale en el libro del contador ni en Excel).
-- 2. `fin_reparto_plantillas`: repartos guardados con nombre («Alquiler Plaza 100: 40/30/30») para aplicarlos en un clic.
-- 3. `fin_reglas.conciliar_auto`: una regla con tienda y tipo que, al buscar coincidencias en la conciliación, crea sola el
--    movimiento del libro de las líneas del banco que la cumplen (comisiones, cargos fijos).
-- 4. Dos tipos para la diferencia de centavos que se ajusta sola al conciliar, y el tope en `fin_config`
--    (`conc_tolerancia_centavos`, 1 = un centavo, lo de antes) y los días para avisar que una cuenta no se concilia
--    (`conc_dias_alerta`).
-- 5. La alerta diaria `conciliacion_atrasada` (Panel financiero › Necesita tu atención).
-- Se puede correr dos veces.

alter table fin_movimientos add column if not exists nota_interna text check (nota_interna is null or length(nota_interna) <= 1000);

create table if not exists fin_reparto_plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 2 and 80),
  -- [{ "unidadId": uuid, "porcentaje": number }], validado en el servidor (suma 100).
  partes jsonb not null check (jsonb_typeof(partes) = 'array'),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists fin_reparto_plantillas_nombre on fin_reparto_plantillas (lower(btrim(nombre)));
alter table fin_reparto_plantillas enable row level security;

alter table fin_reglas add column if not exists conciliar_auto boolean not null default false;

insert into fin_tipos (nombre, seccion, signo, orden) values
  ('Redondeo bancario a favor', 'otros', 1, 525),
  ('Redondeo bancario en contra', 'finanzas', -1, 470)
on conflict (nombre) do nothing;

insert into fin_config (clave, valor) values
  ('conc_tolerancia_centavos', '1'::jsonb),
  ('conc_dias_alerta', '7'::jsonb)
on conflict (clave) do nothing;

comment on table fin_reparto_plantillas is 'Portal AF4 360°: repartos de un gasto entre tiendas guardados con nombre (migración 0986).';

-- 5. Alerta diaria de cuentas sin conciliar (`conciliacion_atrasada`): el check de fin_alertas con la lista de 0983 + la nueva.
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
    'conciliacion_atrasada'
  )) not valid;
end $$;
