-- CRM Dropshippers › Actividad del cliente: productos por los que preguntó y versión del análisis (pedido de Jhokser, 29 oct 2026).
--   * `productos`: los nombres de los productos por los que el cliente preguntó ese día (con el nombre del catálogo cuando se reconocen), para contar qué productos generan más interés.
--   * `version`: con qué versión del análisis se hizo. La 2 usa motivos más específicos y trae productos; los días analizados con la 1 se vuelven a analizar al pulsar «Analizar».
-- Código: src/app/(app)/crm-dropshippers/bandeja/actividad-actions.ts. Reversa: supabase/rollbacks/0183_rollback.sql

alter table whatsapp_actividad add column if not exists productos text[] not null default '{}';
alter table whatsapp_actividad add column if not exists version integer not null default 1;
