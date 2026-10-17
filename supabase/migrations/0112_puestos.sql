-- Equipo › Puestos (fase 1 de EQUIPO-PUESTOS.md, 16 oct 2026): la ficha de cada puesto (misión, responsabilidades, áreas
-- de resultado, autoridad), a quién reporta (de ahí sale el organigrama), quién lo ocupa y qué procedimientos (Manuales de
-- proceso) y cursos (Universidad) tiene que conocer, repartidos en el onboarding de 30, 60 y 90 días.
-- Como todas las tablas: RLS activado y sin políticas (solo el servidor, con la clave de servicio, toca los datos).

create table if not exists puestos (
  id uuid primary key default uuid_v7(),
  nombre text not null check (btrim(nombre) <> ''),
  -- Lista fija en código (`AREAS_PUESTO`, src/lib/puestos/puesto.ts).
  area text not null,
  reporta_a uuid references puestos(id) on delete set null,
  plazas smallint not null default 1 check (plazas between 1 and 99),
  mision text not null default '',
  -- Texto con el formato simple de los manuales («## / - / 1.»); se muestra como texto, nunca como HTML.
  responsabilidades text not null default '',
  autoridad text not null default '',
  kra text[] not null default '{}',
  activo boolean not null default true,
  actualizado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (reporta_a is null or reporta_a <> id)
);
create unique index if not exists puestos_nombre_unico on puestos (lower(btrim(nombre)));
alter table puestos enable row level security;

-- Un puesto no puede terminar reportando a sí mismo por una cadena (A → B → A). El servidor lo revisa antes para dar un
-- error legible; esto es el respaldo.
create or replace function puestos_sin_ciclo() returns trigger language plpgsql as $$
declare
  actual uuid := new.reporta_a;
  pasos int := 0;
begin
  while actual is not null loop
    if actual = new.id then
      raise exception 'El puesto no puede reportar a uno que depende de él.';
    end if;
    pasos := pasos + 1;
    if pasos > 200 then exit; end if;
    select reporta_a into actual from puestos where id = actual;
  end loop;
  return new;
end $$;
drop trigger if exists puestos_sin_ciclo on puestos;
create trigger puestos_sin_ciclo before insert or update of reporta_a on puestos for each row execute function puestos_sin_ciclo();

-- Quién ocupa cada puesto. Una persona puede tener varios, pero uno solo es el principal (de él sale su jefe).
create table if not exists puesto_personas (
  puesto_id uuid not null references puestos(id) on delete cascade,
  usuario_id uuid not null references perfiles(id) on delete cascade,
  principal boolean not null default false,
  desde date not null default current_date,
  creado_en timestamptz not null default now(),
  primary key (puesto_id, usuario_id)
);
create unique index if not exists puesto_personas_un_principal on puesto_personas (usuario_id) where principal;
create index if not exists puesto_personas_usuario on puesto_personas (usuario_id);
alter table puesto_personas enable row level security;

-- Los procedimientos (SOP) del puesto. `etapa` = en qué parte del onboarding se aprende (30, 60 o 90 días); null = de consulta.
create table if not exists puesto_manuales (
  puesto_id uuid not null references puestos(id) on delete cascade,
  manual_id uuid not null references manuales_proceso(id) on delete cascade,
  etapa smallint check (etapa in (30, 60, 90)),
  orden smallint not null default 0,
  primary key (puesto_id, manual_id)
);
alter table puesto_manuales enable row level security;

-- Los cursos de la Universidad del puesto. Los cursos viven en código (src/lib/ayuda/cursos.ts): el servidor valida el id.
create table if not exists puesto_cursos (
  puesto_id uuid not null references puestos(id) on delete cascade,
  curso_id text not null,
  etapa smallint check (etapa in (30, 60, 90)),
  orden smallint not null default 0,
  primary key (puesto_id, curso_id)
);
alter table puesto_cursos enable row level security;

-- Quién leyó qué manual y cuándo. Un manual cuenta como leído si `leido_en` es posterior a su última actualización.
create table if not exists manuales_lecturas (
  usuario_id uuid not null references perfiles(id) on delete cascade,
  manual_id uuid not null references manuales_proceso(id) on delete cascade,
  leido_en timestamptz not null default now(),
  primary key (usuario_id, manual_id)
);
alter table manuales_lecturas enable row level security;

-- El permiso del módulo: quien ya puede trabajar en Usuarios y roles, con su mismo solo lectura.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'puestos', solo_lectura
from permisos_rol
where modulo = 'usuarios'
on conflict (rol_id, modulo) do nothing;
