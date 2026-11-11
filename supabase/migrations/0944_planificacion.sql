-- Portal AF4 360° — Finanzas › Planificación (/planificacion): pronóstico por tienda, motores, plan anual integrado,
-- pronóstico continuo de 18 meses, escenarios por decisión y metas por tienda. La lógica vive en
-- `src/lib/finanzas/pronostico.ts`, `planificacion.ts` y `metas-plan.ts`; las sumas de la historia, en la migración 0945.
--
--  * `fin_plan_motores`: lo editado a mano de los motores de cada tienda (solo los campos cambiados; lo demás sale de los
--    últimos 3 meses reales). Los supuestos generales (días de rotación, impuesto, caja mínima…) van en
--    `fin_config.planificacion`.
--  * `fin_plan_versiones`: cada versión guardada del plan anual (borrador, aprobada o reemplazada) con su foto completa
--    (motores, supuestos y el resultado mes a mes por tienda y consolidado). Una sola aprobada por año.
--  * `fin_plan_fotos`: el pronóstico de 18 meses como estaba al cerrar cada mes (para comparar contra el anterior).
--  * `fin_plan_escenarios`: los escenarios por decisión (tipo y parámetros).
--
-- RLS activado y sin políticas (ver SEGURIDAD.md): solo el servidor, con la clave de servicio, toca estas tablas.
-- Se puede correr dos veces.

create table if not exists fin_plan_motores (
  unidad_id uuid primary key references fin_unidades(id) on delete cascade,
  valores jsonb not null default '{}'::jsonb,
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);
alter table fin_plan_motores enable row level security;

create table if not exists fin_plan_versiones (
  id uuid primary key default gen_random_uuid(),
  anio int not null check (anio between 2020 and 2100),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'reemplazado')),
  -- El último mes real con que se armó (la apertura del balance).
  corte date not null check (extract(day from corte) = 1),
  datos jsonb not null,
  presupuesto_id uuid references fin_presupuestos(id) on delete set null,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  aprobado_por uuid references auth.users(id),
  aprobado_en timestamptz
);
alter table fin_plan_versiones enable row level security;
create unique index if not exists fin_plan_versiones_aprobada on fin_plan_versiones (anio) where estado = 'aprobado';
create index if not exists fin_plan_versiones_anio on fin_plan_versiones (anio, creado_en desc);

create table if not exists fin_plan_fotos (
  -- El mes cerrado con que se armó el pronóstico.
  periodo date primary key check (extract(day from periodo) = 1),
  datos jsonb not null,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
alter table fin_plan_fotos enable row level security;

create table if not exists fin_plan_escenarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  tipo text not null check (tipo in ('pauta', 'precio', 'entrega', 'tienda', 'pais')),
  parametros jsonb not null default '{}'::jsonb,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table fin_plan_escenarios enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Permiso: lo recibe quien ya tiene el Libro de movimientos, con su mismo solo lectura.
-- ---------------------------------------------------------------------------------------------
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'planificacion', solo_lectura
from permisos_rol
where modulo = 'libro-movimientos'
on conflict (rol_id, modulo) do nothing;
