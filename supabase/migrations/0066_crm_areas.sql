-- CRM de dropshippers: áreas de trabajo (Comercial y Atención al cliente) en una sola ficha.
--
-- Un solo CRM, una ficha por dropshipper. Lo que cambia es quién ve qué:
--   * Atención (módulo `crm-dropshippers`): casos, pedidos y sus propias notas.
--   * Comercial (módulo nuevo `crm-comercial`): además, sus notas privadas, sus seguimientos y la captación. Ve también
--     todo lo de Atención. Atención NO ve las notas ni los seguimientos comerciales (se filtra en el servidor).
--   * Captación: dropshippers que llegan por ferias y eventos. `fase` dice dónde van (captado → en onboarding → activo)
--     y, al pasar a `activo`, se asigna un líder comercial (`responsable_id`).
--
-- Las notas que ya había (las de ClickUp) son del trabajo comercial, así que quedan como `comercial`.
-- Las tablas nuevas llevan RLS y ninguna política: solo el servidor las toca (ver migración 0063 y SEGURIDAD.md).

alter table interacciones_dropshipper
  add column if not exists area text not null default 'comercial' check (area in ('comercial', 'atencion')),
  add column if not exists creado_por uuid references perfiles(id) on delete set null;

create index if not exists interacciones_dropshipper_ds_fecha on interacciones_dropshipper (dropshipper_id, fecha desc);

alter table dropshippers
  add column if not exists fase text not null default 'activo' check (fase in ('captado', 'onboarding', 'activo')),
  add column if not exists captado_en date;

-- Seguimientos del área comercial: lo que hay que hacer con un dropshipper y para cuándo. También es donde cae un caso
-- que Atención pasa a Comercial (`origen = 'escalado'`).
create table if not exists tareas_dropshipper (
  id uuid primary key default gen_random_uuid(),
  dropshipper_id uuid not null references dropshippers(id) on delete cascade,
  titulo text not null,
  detalle text,
  vence date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha')),
  origen text not null default 'manual' check (origen in ('manual', 'escalado')),
  caso_id uuid references casos_dropshipper(id) on delete set null,
  responsable_id uuid references perfiles(id) on delete set null,
  creado_por uuid references perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  hecha_en timestamptz
);
create index if not exists tareas_dropshipper_ds_estado on tareas_dropshipper (dropshipper_id, estado, vence);
create index if not exists tareas_dropshipper_responsable on tareas_dropshipper (responsable_id, estado, vence);

alter table casos_dropshipper add column if not exists escalado_en timestamptz;

alter table tareas_dropshipper enable row level security;

-- El rol Admin obtiene el módulo nuevo. Los demás roles se lo dan desde «Usuarios y roles».
insert into permisos_rol (rol_id, modulo)
select r.id, 'crm-comercial'
from roles r
where r.nombre = 'Admin'
  and not exists (select 1 from permisos_rol p where p.rol_id = r.id and p.modulo = 'crm-comercial');
