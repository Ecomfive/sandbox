-- CRM Dropshippers › Actividad con comentarios (29 oct 2026, pedido de Hernán: «que salga la actividad así como la tiene Compras y que se
-- puedan agregar comentarios»): comentarios con archivos, respuestas (un nivel), reacciones y @menciones en cada dropshipper, con el
-- motor común de `src/lib/comentarios/servidor.ts`. Los cambios (notas, casos, seguimientos y la auditoría) siguen saliendo de donde
-- salían, con el filtro de áreas de siempre.
-- Archivos en el bucket privado `crm-dropshippers` (comentarios/<dropshipper>/…), con enlaces firmados de una hora.
-- RLS activado y sin políticas (solo el servidor). Reversa: supabase/rollbacks/0184_rollback.sql

create table if not exists dropshipper_comentarios (
  id uuid primary key default uuid_v7(),
  dropshipper_id uuid not null references dropshippers (id) on delete cascade,
  autor text,
  autor_id uuid references perfiles (id) on delete set null,
  texto text not null default '',
  respuesta_a uuid references dropshipper_comentarios (id) on delete cascade,
  editado_en timestamptz,
  creado_en timestamptz not null default now()
);
alter table dropshipper_comentarios enable row level security;
create index if not exists dropshipper_comentarios_ds on dropshipper_comentarios (dropshipper_id, creado_en desc);

create table if not exists dropshipper_adjuntos (
  id uuid primary key default uuid_v7(),
  dropshipper_id uuid not null references dropshippers (id) on delete cascade,
  comentario_id uuid references dropshipper_comentarios (id) on delete cascade,
  nombre text not null,
  extension text,
  tamano bigint,
  clase text not null default 'otro',
  ruta text not null unique,
  subido_por text,
  creado_en timestamptz not null default now()
);
alter table dropshipper_adjuntos enable row level security;
create index if not exists dropshipper_adjuntos_ds on dropshipper_adjuntos (dropshipper_id);
create index if not exists dropshipper_adjuntos_com on dropshipper_adjuntos (comentario_id);

create table if not exists dropshipper_comentario_reacciones (
  comentario_id uuid not null references dropshipper_comentarios (id) on delete cascade,
  usuario_id uuid not null references perfiles (id) on delete cascade,
  usuario_nombre text,
  emoji text not null,
  creado_en timestamptz not null default now(),
  primary key (comentario_id, usuario_id, emoji)
);
alter table dropshipper_comentario_reacciones enable row level security;

insert into storage.buckets (id, name, public, file_size_limit) values ('crm-dropshippers', 'crm-dropshippers', false, 26214400)
on conflict (id) do nothing;
