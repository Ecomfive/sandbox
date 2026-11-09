-- Portal AF4 360° fase 2: clasificar el libro en el portal (ver FINANZAS-360.md).
--
-- 1. Un movimiento corregido a mano (tienda, tipo, si entra al EERR) queda marcado: reimportar el Excel no lo pisa.
-- 2. Reglas por descripción: «si la descripción contiene X, la tienda es Y y/o el tipo es Z». Se aplican al importar y
--    con «Aplicar reglas» en la bandeja, solo para completar lo que falta (nunca cambian lo que ya vino del Excel).

alter table fin_movimientos add column if not exists editado_a_mano boolean not null default false;
alter table fin_movimientos add column if not exists editado_por uuid references auth.users(id);
alter table fin_movimientos add column if not exists editado_en timestamptz;
alter table fin_movimientos add column if not exists regla_id uuid;

create table if not exists fin_reglas (
  id uuid primary key default gen_random_uuid(),
  -- Texto que debe aparecer en la descripción (sin importar mayúsculas, acentos ni signos).
  patron text not null check (length(trim(patron)) >= 3),
  unidad_id uuid references fin_unidades(id),
  tipo_id uuid references fin_tipos(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  check (unidad_id is not null or tipo_id is not null),
  unique (patron)
);

alter table fin_reglas enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_movimientos_regla_fk') then
    alter table fin_movimientos add constraint fin_movimientos_regla_fk foreign key (regla_id) references fin_reglas(id) on delete set null;
  end if;
end $$;

create index if not exists fin_movimientos_pendientes on fin_movimientos (periodo) where tipo_id is null;
