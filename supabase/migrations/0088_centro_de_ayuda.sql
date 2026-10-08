-- Centro de ayuda (pedido de Hernán, 8 oct 2026): el progreso de cada persona en los cursos de la Universidad y los manuales
-- de proceso que el equipo escribe y edita desde el sistema. El glosario, las guías y el contenido de los cursos viven en el
-- código (src/lib/ayuda/). RLS sin políticas: solo el servidor las toca (migración 0063). Se puede correr más de una vez.

create table if not exists cursos_progreso (
  usuario_id uuid not null references perfiles(id) on delete cascade,
  curso_id text not null,
  -- Mejor nota (de 0 a 100) y cuándo aprobó (null si todavía no).
  puntaje integer not null default 0 check (puntaje between 0 and 100),
  intentos integer not null default 0,
  completado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, curso_id)
);
alter table cursos_progreso enable row level security;

create table if not exists manuales_proceso (
  id uuid primary key default uuid_v7(),
  titulo text not null check (btrim(titulo) <> ''),
  -- Texto con formato simple: líneas, «## Título», «- punto» y «1. paso». Se muestra como texto, nunca como HTML.
  contenido text not null default '',
  -- Módulos de permisos de quienes lo ven (vacío = todo el mundo).
  modulos text[] not null default '{}',
  borrador boolean not null default true,
  actualizado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table manuales_proceso enable row level security;
