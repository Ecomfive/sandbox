-- Gestión de IDs Dropi › «Conectar Dropi» (pedido de Hernán, 22 oct 2026): para que «Usar este título» del Asistente de IA cambie
-- el producto en Dropi al instante (el nombre y, en la guía de envío, el código del SKU). Dropi no tiene una API de proveedor: el
-- sistema usa la sesión de la cuenta de proveedor que una persona entrega con el favorito «Conectar Dropi» (dura 12 horas; el inicio
-- de sesión de Dropi tiene verificación en dos pasos, así que el servidor no puede abrirla solo). Mientras no haya sesión vigente,
-- los cambios quedan pendientes y se aplican al conectar. Código: src/lib/dropi/sesion.ts, src/lib/publicaciones/cambios-dropi.ts.
-- Reversa: supabase/rollbacks/0137_rollback.sql

-- La sesión de proveedor guardada va en `dropi_conexiones` (migración 0138): aquí se pensó como `dropi_sesiones`, pero ese nombre ya
-- era de la 0028 y la tabla no se tocó.

-- Los cambios que el sistema tiene que hacer en Dropi: hoy, el nombre del producto y el nombre en la guía de envío.
create table if not exists dropi_cambios_pendientes (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  publicacion_id uuid not null references dropi_publicaciones(id) on delete cascade,
  dropi_producto_id integer not null,
  -- Dropi admite 40 caracteres en los dos.
  nombre text not null check (char_length(nombre) between 1 and 40),
  nombre_guia text check (nombre_guia is null or char_length(nombre_guia) <= 40),
  -- pendiente → aplicado (Dropi ya lo muestra) o error (con el motivo; se puede reintentar). «reemplazado»: llegó otro cambio de la
  -- misma publicación antes de aplicarse.
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aplicado', 'error', 'reemplazado')),
  intentos integer not null default 0,
  error text,
  creado_por uuid references perfiles(id) on delete set null,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  aplicado_en timestamptz
);

create index if not exists dropi_cambios_pendientes_estado_idx on dropi_cambios_pendientes (pais_id, estado, creado_en);
create index if not exists dropi_cambios_pendientes_pub_idx on dropi_cambios_pendientes (publicacion_id, creado_en desc);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table dropi_cambios_pendientes enable row level security;
