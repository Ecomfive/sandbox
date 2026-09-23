-- Compras: el «Estado» de ClickUp, aparte de la «Etapa» — un semáforo más simple (Backlog, Pendiente,
-- En Gestión, Hecho, En Revisión, Aprobado, Rechazado, Completado) que se lleva por separado.
alter table wms_compras add column if not exists estado text not null default 'backlog' check (
  estado in ('backlog', 'pendiente', 'en_gestion', 'hecho', 'en_revision', 'aprobado', 'rechazado', 'completado')
);
