-- Portal AF4 360° — Calendario fiscal de Panamá y avisos del cierre (mejoras 14 y 24). Ver FINANZAS-360.md.
--
-- 1. OBLIGACIONES (`fin_obligaciones_fiscales`): qué hay que presentar o pagar, cada cuánto y cuándo vence. Vienen
--    cargadas las de Panamá (ITBMS mensual, planilla de la CSS, retenciones, renta anual, tasa única y aviso de
--    operación) con fechas por defecto que se cambian en Cierre de mes › Calendario fiscal: el día, el mes (las anuales),
--    si vence el año siguiente al declarado y con cuántos días de anticipación avisar. Si el día cae en fin de semana o
--    feriado, vence el siguiente día hábil (lo calcula `src/lib/finanzas/calendario-fiscal.ts`).
-- 2. PRESENTACIONES (`fin_obligaciones_presentadas`): la marca «presentado» de cada obligación y período (mes declarado
--    o año), con fecha, referencia y monto.
-- 3. AVISOS: `fin_alertas` admite dos tipos nuevos (tarea del cierre atrasada, obligación fiscal por vencer o vencida) y
--    `notificaciones_usuario` el tipo «cierre» (el aviso al responsable de una tarea del cierre).
--
-- RLS activado y sin políticas (SEGURIDAD.md). Se puede correr dos veces.

create table if not exists fin_obligaciones_fiscales (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave ~ '^[a-z0-9-]{1,40}$'),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  -- Ante quién (DGI, CSS, Municipio…), solo para mostrar.
  entidad text,
  periodicidad text not null check (periodicidad in ('mensual', 'anual')),
  -- Mensual: día del mes siguiente al declarado. Anual: día y mes.
  dia integer not null check (dia between 1 and 31),
  mes integer check (mes is null or mes between 1 and 12),
  -- Anual: vence el año siguiente al declarado (renta) o el mismo año (tasa única).
  anio_siguiente boolean not null default true,
  dias_aviso integer not null default 5 check (dias_aviso between 0 and 60),
  activo boolean not null default true,
  orden integer not null default 0,
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  check (periodicidad = 'mensual' or mes is not null)
);
alter table fin_obligaciones_fiscales enable row level security;

insert into fin_obligaciones_fiscales (clave, nombre, entidad, periodicidad, dia, mes, anio_siguiente, dias_aviso, orden) values
  ('itbms', 'Declaración de ITBMS', 'DGI', 'mensual', 15, null, true, 5, 10),
  ('planilla-css', 'Planilla de la CSS (SIPE)', 'CSS', 'mensual', 15, null, true, 5, 20),
  ('retenciones', 'Retenciones de impuesto sobre la renta', 'DGI', 'mensual', 10, null, true, 5, 30),
  ('renta-anual', 'Declaración jurada de renta', 'DGI', 'anual', 31, 3, true, 30, 40),
  ('tasa-unica', 'Tasa única', 'DGI', 'anual', 15, 7, false, 15, 50),
  ('aviso-operacion', 'Impuesto de aviso de operación', 'DGI', 'anual', 31, 3, true, 30, 60)
on conflict (clave) do nothing;

create table if not exists fin_obligaciones_presentadas (
  id uuid primary key default gen_random_uuid(),
  obligacion_id uuid not null references fin_obligaciones_fiscales(id) on delete cascade,
  -- Mes declarado (AAAA-MM-01) o, en las anuales, el año (AAAA-01-01).
  periodo date not null check (extract(day from periodo) = 1),
  presentado_en date not null,
  referencia text check (referencia is null or length(referencia) <= 120),
  monto numeric(14, 2),
  marcado_por uuid references auth.users(id),
  marcado_en timestamptz not null default now(),
  unique (obligacion_id, periodo)
);
alter table fin_obligaciones_presentadas enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Tipos de aviso nuevos
-- ---------------------------------------------------------------------------------------------
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
    'cierre_tarea_atrasada', 'fiscal_vence'
  -- `not valid`: al volver a correr el archivo junto con la 0152 (que suma los tipos de Tesorería), las alertas que ya
  -- existan de esos tipos no hacen fallar este paso; la 0152 vuelve a poner la lista completa y validada.
  )) not valid;

  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'notificaciones_usuario'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%tipo%'
  loop
    execute format('alter table notificaciones_usuario drop constraint %I', r.conname);
  end loop;
  alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock', 'whatsapp', 'cierre')) not valid;
end $$;

comment on table fin_obligaciones_fiscales is 'Portal AF4 360°: calendario fiscal de Panamá (qué se presenta, cada cuánto y cuándo vence).';
comment on table fin_obligaciones_presentadas is 'Portal AF4 360°: marca de presentado de cada obligación fiscal y período.';
