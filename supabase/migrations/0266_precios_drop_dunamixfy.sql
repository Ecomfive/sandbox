-- Cambiar los precios de Drop y de Dunamixfy desde el sistema (pedido de Hernán, 9 y 10 nov 2026: «que las personas de Gestión de IDs puedan cambiar el
-- precio, como en Dropi», en Drop, Effi y Dunamixfy; Effi ya lo hace por su API). Drop (app.soydrop.com) y Dunamixfy (dunamixfy.cr) no tienen una API para el
-- servidor: el cambio queda en esta cola y lo aplica el favorito «Aplicar precios» desde la pestaña de la plataforma, con la sesión del proveedor, que no sale
-- de ahí (src/lib/publicaciones/marcador-aplicar-precios.ts). En Drop, cada vez que se pulsa, el favorito también lee los precios de todos los productos.
-- En Drop hay dos precios: el del proveedor (sin la comisión de Drop: el que se escribe en Drop, `precio_proveedor`) y el que paga el dropshipper (con la
-- comisión, `precio`, el que ya se leía de «Mis productos»). Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0266_rollback.sql

-- Lo que el favorito lee de Drop: el precio sin comisión, el sugerido, si tiene variantes y cuándo se leyó.
alter table drop_publicaciones add column if not exists precio_proveedor numeric(12, 2) check (precio_proveedor is null or precio_proveedor >= 0);
alter table drop_publicaciones add column if not exists precio_sugerido numeric(12, 2) check (precio_sugerido is null or precio_sugerido >= 0);
alter table drop_publicaciones add column if not exists con_variantes boolean;
alter table drop_publicaciones add column if not exists precios_leidos_en timestamptz;

-- Los cambios de precio que esperan «Aplicar precios». Una fila por cambio; `publicacion_id` es de `drop_publicaciones` o de `dunamixfy_publicaciones`
-- según `plataforma` (por eso sin llave foránea: las publicaciones no se borran, se marcan como que ya no aparecen).
create table if not exists plataforma_cambios_precio (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  plataforma text not null check (plataforma in ('drop', 'dunamixfy')),
  publicacion_id uuid not null,
  -- El id del producto en la plataforma: el interno de Drop (24 hexadecimales) o el interno de Dunamixfy.
  externo text not null check (char_length(externo) between 1 and 64),
  -- En la moneda de la plataforma (colones). En Drop, `precio` es el del proveedor, sin la comisión de Drop.
  precio numeric(14, 2) check (precio is null or precio > 0),
  precio_sugerido numeric(14, 2) check (precio_sugerido is null or precio_sugerido > 0),
  precio_antes numeric(14, 2),
  precio_sugerido_antes numeric(14, 2),
  -- pendiente → aplicado (la plataforma ya lo muestra) o error (con el motivo; se reintenta). «reemplazado»: llegó otro cambio de la misma publicación antes
  -- de aplicarse. «descartado»: una persona lo quitó antes de aplicarlo.
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aplicado', 'error', 'reemplazado', 'descartado')),
  intentos integer not null default 0,
  error text,
  aviso text,
  creado_por uuid references perfiles(id) on delete set null,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  aplicado_en timestamptz,
  constraint plataforma_cambios_precio_algo check (precio is not null or precio_sugerido is not null)
);

create index if not exists plataforma_cambios_precio_estado_idx on plataforma_cambios_precio (plataforma, pais_id, estado, creado_en);
create index if not exists plataforma_cambios_precio_pub_idx on plataforma_cambios_precio (publicacion_id, creado_en desc);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table plataforma_cambios_precio enable row level security;
