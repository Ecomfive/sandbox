-- Portal AF4 360° — Evaluación de proyectos (Capital y riesgo › Proyectos, mejora 39).
--
-- `fin_proyectos`: cada proyecto con sus flujos prometidos por período (jsonb: inversión, ingresos, costos y capital de
-- trabajo; el período 0 es el de la inversión), periodicidad (mes o año), tasa de descuento propia (null = la del portal:
-- el WACC de `fin_config.capital_riesgo` o el costo financiero mezclado del comité), estado borrador → aprobado o
-- rechazado con quién y cuándo, y los flujos reales para el seguimiento de los aprobados (un elemento null = período sin
-- dato). Los cálculos (VAN, TIR, payback, índice, sensibilidad) se hacen en el servidor con
-- src/lib/finanzas/evaluacion-proyectos.ts; no se guardan. RLS sin políticas. Se puede correr dos veces.

create table if not exists fin_proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) between 1 and 120),
  descripcion text check (descripcion is null or length(descripcion) <= 2000),
  periodicidad text not null default 'mes' check (periodicidad in ('mes', 'anio')),
  tasa numeric(7, 2) check (tasa is null or (tasa > -50 and tasa <= 200)),
  inicio date check (inicio is null or extract(day from inicio) = 1),
  flujos jsonb not null default '[]'::jsonb check (jsonb_typeof(flujos) = 'array' and jsonb_array_length(flujos) <= 60),
  reales jsonb not null default '[]'::jsonb check (jsonb_typeof(reales) = 'array' and jsonb_array_length(reales) <= 60),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'rechazado')),
  decidido_por uuid references auth.users(id),
  decidido_por_nombre text,
  decidido_en timestamptz,
  motivo_decision text check (motivo_decision is null or length(motivo_decision) <= 500),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table fin_proyectos enable row level security;
create index if not exists fin_proyectos_estado on fin_proyectos (estado, creado_en desc);
