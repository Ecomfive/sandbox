-- Actualizaciones del sistema vistas por cada persona (31 oct 2026, pedido de Alcides): en el Centro de notificaciones cada quien ve las
-- actualizaciones del sistema de sus módulos (las novedades del Centro de ayuda) y marca cada una como vista al abrirla, como las
-- notificaciones de ClickUp. `clave` identifica la novedad (fecha + huella del título, `claveNovedad` en src/lib/ayuda/actualizaciones.ts).
-- RLS activado y sin políticas: solo el servidor la toca. Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0218_rollback.sql

create table if not exists novedades_vistas (
  usuario_id uuid not null references perfiles(id) on delete cascade,
  clave text not null check (char_length(clave) <= 40),
  visto_en timestamptz not null default now(),
  primary key (usuario_id, clave)
);

alter table novedades_vistas enable row level security;
