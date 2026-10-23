-- Gestión de IDs Dropi › publicaciones duplicadas (pedido de Hernán, 23 oct 2026): al importar ClickUp entraron 11 pares de
-- publicaciones con el mismo ID de Dropi (dos tareas de ClickUp con el mismo ID escrito, no dos productos en Dropi). Se deja la que
-- está al día y la otra queda «Duplicada» de esa: va a Archivados aunque Dropi diga activo y no se puede sacar de ahí. No se borra
-- nada. Los pares los marca scripts/marcar-publicaciones-duplicadas.ts; desde ahora el sistema no deja guardar un ID de Dropi que ya
-- tiene otra publicación del país (actions.ts).
-- Reversa: supabase/rollbacks/0147_rollback.sql

alter table dropi_publicaciones add column if not exists duplicada_de uuid references dropi_publicaciones(id) on delete set null;
alter table dropi_publicaciones drop constraint if exists dropi_publicaciones_duplicada_de_check;
alter table dropi_publicaciones add constraint dropi_publicaciones_duplicada_de_check check (duplicada_de is null or duplicada_de <> id);
