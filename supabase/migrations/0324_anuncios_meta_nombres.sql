-- Anuncios Meta (18 nov 2026, pedido de Alcides): el nombre de las campañas del equipo es
--   PRODUCTO | ALL PA | CBO TEST | RT V1 AL V5 | ARIANNY
-- (producto · audiencia y país · estructura y etapa · tanda de videos · quién la montó). Se guardan tres datos más de la campaña que salen del nombre en cada lectura:
--   * `mercado`: «ALL PA» (a quién se le muestra y dónde).
--   * `videos`: la tanda de videos que lleva («RT V1 AL V5»).
--   * `persona_nombre`: quien la montó según el nombre («Arianny»); manda sobre el registro de actividad de Meta, que da quien tenía la sesión abierta.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0324_rollback.sql
alter table meta_campanas add column if not exists mercado text;
alter table meta_campanas add column if not exists videos text;
alter table meta_campanas add column if not exists persona_nombre text;
notify pgrst, 'reload schema';
