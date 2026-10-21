-- Permisos finos y permisos propios (20 oct 2026).
--
-- Hasta hoy un rol solo decía qué módulos ve una persona y si cada uno es de solo lectura. Esto agrega:
--   * `permisos_afinados`: dentro de un módulo, qué pestañas ve un rol, qué acciones puede usar, qué campos ve (o solo ve sin
--     poder editar) y qué datos alcanza (todas las compras, solo las asignadas…). Solo se guarda lo que se aparta del acceso
--     completo: una fila que dice «oculta», «bloqueada», «oculto», «ver» o un alcance distinto de «todas».
--   * `permisos_persona`: permisos propios de una persona sobre un módulo (sin acceso, lectura o edición) que mandan sobre
--     los de su rol.
--   * `permisos_persona_afinados`: lo mismo que `permisos_afinados`, pero de una persona; manda sobre lo de su rol y puede
--     también soltar lo que el rol restringe («visible», «permitida», «editar», «todas»).
--   * `roles.color`: el color con el que se dibuja el rol.
--
-- Todas con RLS y sin políticas (solo el servidor con la clave de servicio las toca). No cambia ningún permiso existente.
-- Para deshacerlo: supabase/rollbacks/0116_rollback.sql.

begin;

alter table roles add column if not exists color text;

create table if not exists permisos_afinados (
  id uuid primary key default gen_random_uuid(),
  rol_id uuid not null references roles(id) on delete cascade,
  modulo text not null,
  tipo text not null check (tipo in ('pestana', 'accion', 'campo', 'alcance')),
  clave text not null,
  valor text not null,
  creado_en timestamptz not null default now(),
  unique (rol_id, modulo, tipo, clave)
);
create index if not exists permisos_afinados_rol_idx on permisos_afinados (rol_id);

create table if not exists permisos_persona (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  modulo text not null,
  nivel text not null check (nivel in ('ninguno', 'lectura', 'edicion')),
  creado_en timestamptz not null default now(),
  unique (perfil_id, modulo)
);
create index if not exists permisos_persona_perfil_idx on permisos_persona (perfil_id);

create table if not exists permisos_persona_afinados (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  modulo text not null,
  tipo text not null check (tipo in ('pestana', 'accion', 'campo', 'alcance')),
  clave text not null,
  valor text not null,
  creado_en timestamptz not null default now(),
  unique (perfil_id, modulo, tipo, clave)
);
create index if not exists permisos_persona_afinados_perfil_idx on permisos_persona_afinados (perfil_id);

alter table permisos_afinados enable row level security;
alter table permisos_persona enable row level security;
alter table permisos_persona_afinados enable row level security;

commit;
