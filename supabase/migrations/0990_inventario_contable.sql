-- 0990 · Inventario contable (lista de 100 mejoras, 73, 78 y 79; 19 nov 2026). Reversa: supabase/rollbacks/0990_rollback.sql.
--
-- 1. Tipo del libro «Provisión por inventario obsoleto» (costo de ventas): la provisión del mes por lo que lleva 120 días
--    o más sin salidas (50 %) y 180 o más (100 %). Se asienta la diferencia contra lo ya provisionado (un negativo es
--    un reverso).
-- 2. `fin_config.inventario_consignacion`: las bodegas cuya mercancía no es nuestra; no suman al inventario contable.
-- 3. `fin_ajustes_inventario`: un conteo físico que cambia el stock queda pendiente con su soporte hasta que otra persona
--    lo aprueba (entonces se aplican los ajustes al WMS) o lo rechaza.
-- RLS activado y sin políticas. Se puede correr dos veces.

insert into fin_tipos (nombre, seccion, signo, orden) values
  ('Provisión por inventario obsoleto', 'costo_ventas', -1, 122)
on conflict (nombre) do nothing;

insert into fin_config (clave, valor) values ('inventario_consignacion', '[]'::jsonb) on conflict (clave) do nothing;

create table if not exists fin_ajustes_inventario (
  id uuid primary key default gen_random_uuid(),
  archivo text not null check (char_length(archivo) between 1 and 120),
  soporte text not null check (char_length(btrim(soporte)) between 5 and 500),
  -- Las filas del conteo ya validadas ({ fila, producto, bodega, lote, unidades }); al aprobar se recalcula la diferencia
  -- contra el WMS de ese momento.
  filas jsonb not null check (jsonb_typeof(filas) = 'array'),
  -- Lo que se vio al pedirlo: [{ codigo, bodega, lote, actual, contado, diferencia }].
  diferencias jsonb not null default '[]'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  resultado jsonb,
  motivo_rechazo text check (motivo_rechazo is null or char_length(motivo_rechazo) <= 500),
  solicitado_por uuid references auth.users(id),
  solicitado_en timestamptz not null default now(),
  resuelto_por uuid references auth.users(id),
  resuelto_en timestamptz
);
create index if not exists fin_ajustes_inventario_estado on fin_ajustes_inventario (estado, solicitado_en desc);
alter table fin_ajustes_inventario enable row level security;

comment on table fin_ajustes_inventario is 'Portal AF4 360°: ajustes de inventario de un conteo, pendientes de aprobación (migración 0990).';
