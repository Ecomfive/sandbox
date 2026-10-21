-- Operación › Fulfillment › «Gestión de publicaciones Dropi» (pedido de Hernán, 21 oct 2026): los productos que ECOMFIVE tiene
-- publicados en Dropi como proveedor, con su precio, margen, estado de venta, dónde está el stock, reposición, privatización y
-- revisión. Reemplaza la lista «GCC 🇵🇦 Ecomfive Panamá» de ClickUp (scripts/importar-publicaciones-dropi.ts). Va por país; los
-- SKU (Producto) se vinculan después. Se puede repetir.

create table if not exists dropi_publicaciones (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  nombre text not null,
  -- El ID del producto en Dropi, como texto: a veces son dos («7231-7679», un combo o una publicación repetida).
  dropi_id text,
  -- El flujo de trabajo (los estados de la lista de ClickUp).
  estado text not null default 'producto_nuevo'
    check (estado in ('producto_nuevo', 'revisar_precio', 'verificar_dropshipper', 'validar_bajar_precio', 'bajar_precio', 'al_dia', 'archivado')),
  -- Cómo está en Dropi.
  estado_publicacion text check (estado_publicacion in ('activo', 'archivado', 'eliminado', 'descartado', 'en_espera')),
  tipo_publicacion text check (tipo_publicacion in ('publico', 'privado')),
  -- A qué dropshipper se privatizó (nombre y correo, como en ClickUp) y, cuando se vincule, su ficha del CRM.
  privatizado_a text,
  privatizado_email text,
  dropshipper_id uuid references dropshippers(id) on delete set null,
  -- Precio y costos en la moneda de Dropi del país (dólares en Panamá). Coste real = lo que costó la última compra.
  precio_venta numeric(12, 2) check (precio_venta is null or precio_venta >= 0),
  costo_mercancia numeric(12, 2) check (costo_mercancia is null or costo_mercancia >= 0),
  fulfillment numeric(12, 2) check (fulfillment is null or fulfillment >= 0),
  coste_real numeric(12, 2) check (coste_real is null or coste_real >= 0),
  utilidad numeric(12, 2) generated always as (precio_venta - coalesce(costo_mercancia, 0) - coalesce(fulfillment, 0)) stored,
  margen numeric(8, 4) generated always as (
    case when precio_venta > 0 then (precio_venta - coalesce(costo_mercancia, 0) - coalesce(fulfillment, 0)) / precio_venta end
  ) stored,
  estado_venta text check (estado_venta in ('mas_vendidos', 'estable', 'lento', 'estancado', 'sin_stock')),
  ubicacion text check (ubicacion in ('bodega_dropi', 'bodega_ecomfive', 'marketfull', 'boxful', 'bodega_effi', 'dunamixfy')),
  estado_reposicion text check (estado_reposicion in ('solicitud', 'esperando_stock', 'precaucion', 'no_pedir_mas', 'seguir_pidiendo')),
  competencia boolean,
  fecha_publicacion date,
  ultima_revision date,
  -- Se revisa cada 28 días (en ClickUp la fecha límite era la última revisión + 28).
  proxima_revision date generated always as (ultima_revision + 28) stored,
  ultimo_cambio_precio date,
  foto_url text,
  notas text,
  responsable_id uuid references perfiles(id) on delete set null,
  -- Otras publicaciones relacionadas (la misma línea, un combo…).
  relacionados uuid[] not null default '{}',
  -- El producto de Producto, cuando se vincule.
  sku_maestro_id uuid references skus_maestros(id) on delete set null,
  -- La tarea de ClickUp de la que salió, completa (no se pierde ningún dato).
  clickup_id text unique,
  clickup jsonb,
  creado_por uuid references perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists dropi_publicaciones_pais_idx on dropi_publicaciones (pais_id, estado);
create index if not exists dropi_publicaciones_dropi_idx on dropi_publicaciones (pais_id, dropi_id);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table dropi_publicaciones enable row level security;

-- Quien tenía Compras recibe el módulo nuevo con su mismo solo lectura; después se ajusta por rol.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'publicaciones-dropi', solo_lectura from permisos_rol where modulo = 'compras'
on conflict (rol_id, modulo) do nothing;
