-- Campos de gestión de tareas para retiros (persona asignada, prioridad,
-- etiquetas, fecha límite), para el panel de creación estilo ClickUp.

alter table retiros
  add column if not exists asignado_a uuid references perfiles(id),
  add column if not exists prioridad text check (prioridad in ('baja', 'media', 'alta', 'urgente')),
  add column if not exists etiquetas text[] not null default '{}',
  add column if not exists fecha_limite date;
