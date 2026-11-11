-- Portal AF4 360° — Finanzas › Presupuesto y escenarios (/presupuesto).
--
-- Un presupuesto anual con tres escenarios (conservador, base, optimista), generado desde el EERR real
-- (`fin_eerr_mensual`, migración 0901) con los supuestos guardados en `supuestos` (jsonb) para verlos y rehacerlo, y
-- corregible a mano celda por celda. La lógica (generar, comparar con el real, sensibilidad) vive en
-- `src/lib/finanzas/presupuesto.ts`.
--
-- `fin_presupuesto_lineas.monto` va como se lee en el EERR: ingresos netos en positivo y cada sección de costos y gastos
-- en positivo (lo que se gasta). El efecto en el resultado es + para ingresos y − para las demás secciones.
-- `unidad_id` null = consolidado; con `por_tienda` el presupuesto se reparte por tienda.
--
-- RLS activado y sin políticas (ver SEGURIDAD.md): solo el servidor, con la clave de servicio, toca estas tablas.
-- Se puede correr dos veces.

create table if not exists fin_presupuestos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  anio int not null check (anio between 2020 and 2100),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'cerrado')),
  -- true: líneas por tienda (se suman para el consolidado); false: solo consolidado (unidad_id null).
  por_tienda boolean not null default false,
  supuestos jsonb not null default '{}'::jsonb,
  notas text check (notas is null or length(notas) <= 2000),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  aprobado_en timestamptz,
  aprobado_por uuid references auth.users(id),
  cerrado_en timestamptz,
  cerrado_por uuid references auth.users(id),
  unique (anio, nombre)
);

create table if not exists fin_presupuesto_lineas (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references fin_presupuestos(id) on delete cascade,
  escenario text not null check (escenario in ('conservador', 'base', 'optimista')),
  periodo date not null check (extract(day from periodo) = 1),
  unidad_id uuid references fin_unidades(id),
  seccion text not null check (seccion in ('ingresos', 'costo_ventas', 'administracion', 'marketing', 'finanzas', 'otros', 'impuesto_ganancias')),
  tipo_id uuid references fin_tipos(id),
  monto numeric(14, 2) not null default 0,
  origen text not null default 'generado' check (origen in ('manual', 'generado')),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id)
);

-- Una línea por celda (null cuenta como un valor: el consolidado y «sin tipo» también son únicos). Es la llave del
-- upsert al editar una celda.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_presupuesto_lineas_celda') then
    alter table fin_presupuesto_lineas
      add constraint fin_presupuesto_lineas_celda
      unique nulls not distinct (presupuesto_id, escenario, periodo, unidad_id, seccion, tipo_id);
  end if;
end $$;

create index if not exists fin_presupuesto_lineas_presupuesto on fin_presupuesto_lineas (presupuesto_id, escenario, periodo);

alter table fin_presupuestos enable row level security;
alter table fin_presupuesto_lineas enable row level security;

-- Totales del año por presupuesto, escenario y sección (para la lista; se suma en la base, no en JavaScript).
create or replace view fin_presupuesto_totales
with (security_invoker = true) as
select presupuesto_id, escenario, seccion, sum(monto) as monto
from fin_presupuesto_lineas
group by 1, 2, 3;

comment on table fin_presupuestos is 'Portal AF4 360°: presupuesto anual con escenarios, generado desde el EERR real.';
comment on table fin_presupuesto_lineas is 'Portal AF4 360°: monto presupuestado por escenario, mes, tienda (null = consolidado) y sección del EERR.';

-- Permiso: lo recibe quien tiene «Estado de resultados», con su mismo nivel (lectura o escritura).
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'presupuesto', solo_lectura
from permisos_rol
where modulo = 'estado-resultados'
on conflict (rol_id, modulo) do nothing;
