-- Portal AF4 360°: datos y calidad del libro de movimientos (ver FINANZAS-360.md).
--
-- 1. Catálogo único de proveedores con alias («META», «META ADS», «FACEBK» → Meta) y RUC/DV validado.
-- 2. Revisiones de calidad que se recuerdan: un par marcado «no es duplicado» o un monto atípico ya revisado.
-- 3. Anular un movimiento (un duplicado): sale del EERR y del flujo y queda marcado, sin borrarse.
-- 4. Bitácora de importaciones (archivo, quién, cuándo, módulo, cifras) y, en el libro, qué movimientos creó cada una
--    (`importacion_id`) para poder deshacerla.
-- 5. Comprobantes (factura, recibo) de cada movimiento en un bucket privado.
--
-- Todo usa el módulo `libro-movimientos` (no hay módulo nuevo). RLS activado y sin políticas: solo el servidor, con la
-- clave de servicio, toca estas tablas. Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- 1. Proveedores
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 2 and 120),
  ruc text,
  dv text check (dv is null or dv ~ '^\d{2}$'),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists fin_proveedores_nombre on fin_proveedores (upper(nombre));
create unique index if not exists fin_proveedores_ruc on fin_proveedores (upper(ruc)) where ruc is not null;

-- Cada alias apunta a un solo proveedor (se guarda normalizado: mayúsculas, sin acentos ni signos).
create table if not exists fin_proveedor_alias (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references fin_proveedores(id) on delete cascade,
  alias text not null check (length(alias) between 2 and 120),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  unique (alias)
);
create index if not exists fin_proveedor_alias_proveedor on fin_proveedor_alias (proveedor_id);

alter table fin_proveedores enable row level security;
alter table fin_proveedor_alias enable row level security;

-- ---------------------------------------------------------------------------------------------
-- 2. Revisiones de calidad
-- ---------------------------------------------------------------------------------------------
-- clave: «dup:<idMenor>|<idMayor>» (no es duplicado) o «atip:<id>» (atípico revisado).
create table if not exists fin_calidad_revisados (
  clave text primary key check (clave ~ '^(dup|atip):'),
  tipo text not null check (tipo in ('duplicado', 'atipico')),
  movimiento_id uuid references fin_movimientos(id) on delete cascade,
  movimiento_b uuid references fin_movimientos(id) on delete cascade,
  nota text,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id)
);
alter table fin_calidad_revisados enable row level security;

-- ---------------------------------------------------------------------------------------------
-- 3. Anular un movimiento
-- ---------------------------------------------------------------------------------------------
alter table fin_movimientos add column if not exists anulado_en timestamptz;
alter table fin_movimientos add column if not exists anulado_por uuid references auth.users(id);
alter table fin_movimientos add column if not exists anulado_motivo text;
-- Para devolverlo como estaba: si entraba al EERR y al flujo.
alter table fin_movimientos add column if not exists anulado_previo jsonb;

-- ---------------------------------------------------------------------------------------------
-- 4. Bitácora de importaciones
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_importaciones (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,
  archivo text not null,
  usuario_id uuid references auth.users(id),
  usuario_nombre text,
  creado_en timestamptz not null default now(),
  terminado_en timestamptz,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'terminada', 'fallida', 'deshecha')),
  nuevas integer not null default 0,
  actualizadas integer not null default 0,
  saltadas integer not null default 0,
  borradas integer not null default 0,
  -- Las frases del resultado («120 movimientos», «3 sin tipo»…).
  detalle jsonb,
  deshecha_en timestamptz,
  deshecha_por uuid references auth.users(id),
  deshechas integer
);
create index if not exists fin_importaciones_fecha on fin_importaciones (creado_en desc);
alter table fin_importaciones enable row level security;

-- Lo que creó cada importación del libro (no se pone al actualizar: deshacer solo borra lo que esa carga agregó).
alter table fin_movimientos add column if not exists importacion_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_movimientos_importacion_fk') then
    alter table fin_movimientos add constraint fin_movimientos_importacion_fk foreign key (importacion_id) references fin_importaciones(id) on delete set null;
  end if;
end $$;
create index if not exists fin_movimientos_importacion on fin_movimientos (importacion_id) where importacion_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 5. Comprobantes
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_movimiento_adjuntos (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references fin_movimientos(id) on delete cascade,
  ruta text not null unique check (ruta ~ '^movimientos/[0-9a-f-]{36}/' and position('..' in ruta) = 0),
  nombre text not null,
  tipo text not null,
  tamano integer not null check (tamano > 0),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id)
);
create index if not exists fin_movimiento_adjuntos_mov on fin_movimiento_adjuntos (movimiento_id);
alter table fin_movimiento_adjuntos enable row level security;

-- Bucket privado: se ve solo con enlaces firmados que da el servidor.
insert into storage.buckets (id, name, public)
values ('fin-comprobantes', 'fin-comprobantes', false)
on conflict (id) do nothing;
