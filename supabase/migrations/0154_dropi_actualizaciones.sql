-- «Actualizar Dropi» (pedido de Hernán, 26 oct 2026): un botón en Gestión de IDs Dropi abre un panel que, con la extensión de
-- Chrome «Ecomfive · Dropi», lee Dropi desde su pestaña (Dropi rechaza las lecturas que vienen del servidor) y el sistema procesa lo
-- leído. Cada vez que se pulsa queda aquí: quién, cuándo y cómo le fue a cada parte (pedidos, cartera, retiros, stock, ventas…),
-- para el historial del panel y la «última vez» de cada parte. Solo lee Dropi: no crea ni cambia nada allá ni en las publicaciones.
-- Código: src/lib/dropi-actualizar/, src/app/(app)/publicaciones-dropi/actualizar/, extension/ecomfive-dropi/.
-- Reversa: supabase/rollbacks/0154_rollback.sql

create table if not exists dropi_actualizaciones (
  id uuid primary key default uuid_v7(),
  iniciado_por uuid references perfiles(id) on delete set null,
  iniciado_por_nombre text,
  -- «manual» = alguien pulsó el botón; «automatica» = la de cada mañana de la extensión.
  origen text not null default 'manual' check (origen in ('manual', 'automatica')),
  estado text not null default 'corriendo' check (estado in ('corriendo', 'listo', 'con_fallos', 'detenido')),
  -- Las partes que se pidieron, en orden.
  pedidas text[] not null default '{}',
  -- Cómo le fue a cada parte: { "<parte>": { "estado": "listo|error|omitida", "resumen": "…", "datos": {…}, "fin": "…" } }.
  partes jsonb not null default '{}',
  inicio timestamptz not null default now(),
  fin timestamptz
);

create index if not exists dropi_actualizaciones_inicio_idx on dropi_actualizaciones (inicio desc);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table dropi_actualizaciones enable row level security;
