-- Gestión de IDs Dropi › Tareas como en ClickUp (pedido de Alcides, 29 oct 2026): cada tarea escrita a mano tiene un estado (Por hacer, En curso, En
-- revisión, Hecha), una prioridad (Urgente, Alta, Normal, Baja) y se puede archivar (sale de la lista y se ve con «Archivadas»). `hecha_en` sigue
-- diciendo cuándo se hizo: se llena al pasar a Hecha y se vacía si vuelve a otro estado. Código: src/lib/publicaciones/tareas.ts, tareas-actions.ts.
-- Reversa: supabase/rollbacks/0178_rollback.sql

alter table dropi_publicaciones_tareas add column if not exists estado text not null default 'por_hacer';
alter table dropi_publicaciones_tareas add column if not exists prioridad text;
alter table dropi_publicaciones_tareas add column if not exists archivada_en timestamptz;

alter table dropi_publicaciones_tareas drop constraint if exists dropi_publicaciones_tareas_estado_check;
alter table dropi_publicaciones_tareas add constraint dropi_publicaciones_tareas_estado_check check (estado in ('por_hacer', 'en_curso', 'en_revision', 'hecha'));
alter table dropi_publicaciones_tareas drop constraint if exists dropi_publicaciones_tareas_prioridad_check;
alter table dropi_publicaciones_tareas add constraint dropi_publicaciones_tareas_prioridad_check check (prioridad is null or prioridad in ('urgente', 'alta', 'normal', 'baja'));

-- Las que ya estaban resueltas quedan «Hecha».
update dropi_publicaciones_tareas set estado = 'hecha' where hecha_en is not null and estado <> 'hecha';
