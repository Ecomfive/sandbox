-- Gestión de IDs Dropi › Tareas (pedido de Alcides, 28 oct 2026): una tarea escrita a mano sobre una publicación («Mañana verificar el inventario
-- de la almohada de relajación viajera»), con a quién le toca y para cuándo, que después se resuelve. Cada persona ve las suyas en la pestaña
-- «Tareas» y un administrador las de todos. Las que nacen de aceptar una recomendación siguen en dropi_publicaciones_decisiones (0128).
-- Solo el servidor toca los datos: RLS sin políticas. Código: src/lib/publicaciones/tareas.ts, src/app/(app)/publicaciones-dropi/tareas-actions.ts.
-- Reversa: supabase/rollbacks/0175_rollback.sql

create table if not exists dropi_publicaciones_tareas (
  id uuid primary key default uuid_v7(),
  publicacion_id uuid not null references dropi_publicaciones (id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200),
  nota text check (nota is null or char_length(nota) <= 1000),
  responsable_id uuid references perfiles (id) on delete set null,
  responsable_nombre text,
  plazo date,
  creado_por uuid references perfiles (id) on delete set null,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  hecha_en timestamptz,
  hecha_por_nombre text,
  hecha_nota text check (hecha_nota is null or char_length(hecha_nota) <= 600)
);

create index if not exists dropi_publicaciones_tareas_publicacion_idx on dropi_publicaciones_tareas (publicacion_id);
create index if not exists dropi_publicaciones_tareas_pendientes_idx on dropi_publicaciones_tareas (responsable_id, plazo) where hecha_en is null;

alter table dropi_publicaciones_tareas enable row level security;
