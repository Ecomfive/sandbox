-- «Conectar Dropi» (continuación de la 0137, 22 oct 2026): la sesión de proveedor de Dropi que guarda el sistema va en
-- `dropi_conexiones`. La 0137 la quería en `dropi_sesiones`, pero ese nombre ya era de la 0028 (estado de la renovación de la sesión,
-- que leen todos los usuarios con sesión: no sirve para guardar una sesión), así que allí no se creó nada y esa tabla sigue igual.
-- Código: src/lib/dropi/sesion.ts. Reversa: supabase/rollbacks/0138_rollback.sql

-- La sesión de proveedor de Dropi por país, CIFRADA (AES-256-GCM con una clave que solo tiene el servidor): sin esa clave, la fila
-- no sirve. Una por país; conectar de nuevo la reemplaza.
create table if not exists dropi_conexiones (
  pais_id uuid primary key references paises(id),
  token_cifrado text not null,
  dropi_usuario_id integer not null,
  dropi_usuario text,
  vence_en timestamptz not null,
  conectado_por uuid references perfiles(id) on delete set null,
  conectado_por_nombre text,
  conectado_en timestamptz not null default now()
);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table dropi_conexiones enable row level security;
