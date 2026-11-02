-- Testing Lab › Tu Winner (pedido de Hernán, 2 nov 2026): los productos ganadores de Dropi según Tu Winner (app.tuwinner.com), leídos cada día con la
-- sesión de Ecomfive en Chrome (extensión «Ecomfive · Dropi», lector `tuwinner`), para seguirlos en el tiempo y cruzarlos con lo nuestro y con las demás
-- fuentes del Testing Lab. Tu Winner solo muestra la última semana: el sistema guarda cada lectura para saber cuántos días lleva ganando un producto, cuándo
-- dejó de ganar y cuándo cambió su precio o su proveedor. Panamá y México (Tu Winner no tiene Costa Rica). Solo lee y escribe el servidor (RLS sin políticas).
-- Reversa: supabase/rollbacks/0223_rollback.sql

-- Cada lectura (manual con «Leer ahora» o la primera del día al abrir el panel).
create table if not exists tuwinner_lecturas (
  id uuid primary key default gen_random_uuid(),
  inicio timestamptz not null default now(),
  fin timestamptz,
  estado text not null default 'corriendo' check (estado in ('corriendo', 'listo', 'error')),
  iniciado_por uuid references perfiles(id) on delete set null,
  iniciado_por_nombre text,
  -- {"PA": 23, "MX": 105}: cuántos ganadores trajo de cada país.
  resumen jsonb,
  error text
);
create index if not exists tuwinner_lecturas_inicio_idx on tuwinner_lecturas (inicio desc);

-- Un producto de Tu Winner por país, con lo de su última lectura. `dropi_id` es el ID del producto en Dropi (así el cruce con lo nuestro es exacto).
create table if not exists tuwinner_productos (
  pais text not null check (pais in ('PA', 'MX')),
  dropi_id text not null,
  -- El id del registro en Tu Winner (para su foto).
  tw_id text not null,
  nombre text not null,
  proveedor text,
  proveedor_dropi_id text,
  plataforma text,
  precio numeric(12, 2),
  precio_sugerido numeric(12, 2),
  categoria text,
  foto_url text,
  -- De la última lectura: ventas de 7 días (lo que bajó el stock) y stock.
  ventas_7d integer,
  stock integer,
  -- Si está entre los ganadores de la última lectura, su puesto y desde qué día gana sin cortar.
  ganador boolean not null default false,
  posicion integer,
  ganador_desde date,
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  primary key (pais, dropi_id)
);
create index if not exists tuwinner_productos_ganador_idx on tuwinner_productos (pais, ganador, posicion);

-- El stock de cada producto cada día (Tu Winner da los últimos 8 o 9 días en cada lectura): de aquí salen las ventas por día y los reabastecimientos.
create table if not exists tuwinner_dias (
  pais text not null,
  dropi_id text not null,
  dia date not null,
  stock integer not null,
  primary key (pais, dropi_id, dia),
  foreign key (pais, dropi_id) references tuwinner_productos (pais, dropi_id) on delete cascade
);

-- Lo que cambió entre lecturas: entró o salió de los ganadores, cambió de precio o de proveedor.
create table if not exists tuwinner_eventos (
  id uuid primary key default gen_random_uuid(),
  pais text not null,
  dropi_id text not null,
  momento timestamptz not null default now(),
  tipo text not null check (tipo in ('entro', 'salio', 'precio', 'proveedor')),
  antes text,
  despues text,
  foreign key (pais, dropi_id) references tuwinner_productos (pais, dropi_id) on delete cascade
);
create index if not exists tuwinner_eventos_producto_idx on tuwinner_eventos (pais, dropi_id, momento desc);

alter table tuwinner_lecturas enable row level security;
alter table tuwinner_productos enable row level security;
alter table tuwinner_dias enable row level security;
alter table tuwinner_eventos enable row level security;

-- Un producto de Tu Winner se manda a Selección una sola vez («PA|11253»).
alter table wms_seleccion_productos add column if not exists tuwinner_clave text;
create unique index if not exists wms_seleccion_productos_tuwinner_uidx on wms_seleccion_productos (tuwinner_clave) where tuwinner_clave is not null;
