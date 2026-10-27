-- Verificación en dos pasos al ingresar (pedido de Jhokser, 27 oct 2026). Dos métodos: una app autenticadora (TOTP, lo guarda Supabase Auth
-- con su MFA nativo: no necesita tabla) y un código de 6 dígitos por correo, que sí se guarda aquí (solo su huella, nunca el código).
-- Código: src/lib/seguridad/segundo-paso.ts, segundo-paso-servidor.ts y src/app/login/verificar/.
-- Reversa: supabase/rollbacks/0166_rollback.sql

create table if not exists segundo_paso_codigos (
  id uuid primary key default uuid_v7(),
  usuario_id uuid not null references perfiles(id) on delete cascade,
  -- HMAC-SHA256 (con el secreto del servidor) del usuario y el código: con la base sola no se saca el código.
  codigo_hash text not null,
  creado_en timestamptz not null default now(),
  vence_en timestamptz not null,
  -- Cada intento fallido suma uno; con 5 el código se quema.
  intentos integer not null default 0,
  usado_en timestamptz
);
create index if not exists segundo_paso_codigos_usuario_idx on segundo_paso_codigos (usuario_id, creado_en desc);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table segundo_paso_codigos enable row level security;

-- Suma un intento fallido de forma atómica y devuelve cuántos lleva: probar muchos códigos a la vez no da más oportunidades.
create or replace function segundo_paso_sumar_intento(p_id uuid) returns integer
language sql
set search_path = public
as $$
  update segundo_paso_codigos set intentos = intentos + 1 where id = p_id returning intentos;
$$;
revoke all on function segundo_paso_sumar_intento(uuid) from public, anon, authenticated;
