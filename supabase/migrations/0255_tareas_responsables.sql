-- Gestión de IDs Dropi › Tareas con varios responsables (8 nov 2026, pedido de Alcides). El responsable principal sigue en
-- `dropi_publicaciones_tareas.responsable_id`; las demás personas van aquí (sin repetir la principal). Cada una ve la tarea en «Mías» y recibe el aviso.
-- RLS activado y sin políticas (solo el servidor). Reversa: supabase/rollbacks/0255_rollback.sql

create table if not exists dropi_tareas_responsables (
  tarea_id uuid not null references dropi_publicaciones_tareas (id) on delete cascade,
  persona_id uuid not null references perfiles (id) on delete cascade,
  persona_nombre text,
  creado_en timestamptz not null default now(),
  primary key (tarea_id, persona_id)
);
alter table dropi_tareas_responsables enable row level security;
create index if not exists dropi_tareas_responsables_persona on dropi_tareas_responsables (persona_id);
