-- CRM de dropshippers: lo que hace falta para migrar la lista «CRM DROPI» de ClickUp tal como está.
--
-- * etapa: el estado que tenía en ClickUp (leads, seguimiento, privado, dropshippers, archivado…). Es distinto de
--   `estado` (prospecto / activo / inactivo), que es el del CRM.
-- * productos: lo que vende u ofrece. asignado_clickup: quién lo atendía allá (aún no son usuarios del sistema).
-- * clickup_ids / clickup: las tareas de origen, completas (campos, etiquetas, descripción), para no perder nada.
--   Una misma persona puede estar en ClickUp en varios estados; aquí es un solo dropshipper con todas sus tareas.
-- * Los países de ClickUp que aún no existían (México, Colombia) se crean para poder decir «vende en México».
-- NO se corre hasta revisar el informe del importador (scripts/importar-dropshippers-clickup.ts, sin --aplicar).

alter table dropshippers
  add column if not exists etapa text,
  add column if not exists productos text[] not null default '{}',
  add column if not exists telefono_alterno text,
  add column if not exists asignado_clickup text,
  add column if not exists clickup_ids text[] not null default '{}',
  add column if not exists clickup jsonb;

create index if not exists dropshippers_clickup_ids on dropshippers using gin (clickup_ids);

insert into paises (codigo, nombre) values ('MX', 'México'), ('CO', 'Colombia')
on conflict (codigo) do nothing;
