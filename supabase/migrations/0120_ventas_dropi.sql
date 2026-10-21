-- Desempeño › «Ventas Dropi» (pedido de Hernán, 21 oct 2026): las ventas de cada producto que ECOMFIVE tiene en Dropi, sacadas del
-- Historial de Existencia de Dropi (cada salida por orden, cancelación, rechazo y devolución). Se carga con
-- scripts/importar-ventas-dropi.ts; cada carga reemplaza la anterior del país. Se puede repetir.

-- Cada producto de Dropi con su stock al momento de la carga.
create table if not exists dropi_ventas_productos (
  pais_id uuid not null references paises(id),
  dropi_producto_id integer not null,
  nombre text not null,
  -- Si en Dropi está en Activos o en Archivados.
  lista text not null check (lista in ('activo', 'archivado')),
  privado boolean not null default false,
  variable boolean not null default false,
  stock integer not null default 0,
  primera_venta date,
  ultima_venta date,
  actualizado_en timestamptz not null default now(),
  primary key (pais_id, dropi_producto_id)
);

-- Las unidades de cada producto por día (hora de Panamá), para las gráficas y las ventanas de 30 y 90 días.
create table if not exists dropi_ventas_diarias (
  pais_id uuid not null references paises(id),
  dropi_producto_id integer not null,
  dia date not null,
  pedidas integer not null default 0,
  ordenes integer not null default 0,
  canceladas integer not null default 0,
  rechazadas integer not null default 0,
  devueltas integer not null default 0,
  primary key (pais_id, dropi_producto_id, dia)
);
create index if not exists dropi_ventas_diarias_dia_idx on dropi_ventas_diarias (pais_id, dia);

-- Cada dropshipper que creó órdenes: lo cancelado, rechazado o devuelto se le carga por el número de orden.
create table if not exists dropi_ventas_dropshippers (
  pais_id uuid not null references paises(id),
  dropi_usuario_id integer not null,
  nombre text not null,
  pedidas integer not null default 0,
  ordenes integer not null default 0,
  no_efectivas integer not null default 0,
  netas_30d integer not null default 0,
  productos integer not null default 0,
  ultima_orden date,
  primary key (pais_id, dropi_usuario_id)
);

-- Cada carga: hasta cuándo llegan los datos y cuántos movimientos se leyeron.
create table if not exists dropi_ventas_cargas (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  corte timestamptz not null,
  productos integer not null,
  movimientos integer not null,
  cargado_en timestamptz not null default now()
);
create index if not exists dropi_ventas_cargas_pais_idx on dropi_ventas_cargas (pais_id, corte desc);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table dropi_ventas_productos enable row level security;
alter table dropi_ventas_diarias enable row level security;
alter table dropi_ventas_dropshippers enable row level security;
alter table dropi_ventas_cargas enable row level security;

-- Quien ve Gestión de publicaciones Dropi recibe la página nueva con su mismo solo lectura; después se ajusta por rol.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'ventas-dropi', solo_lectura from permisos_rol where modulo = 'publicaciones-dropi'
on conflict (rol_id, modulo) do nothing;
