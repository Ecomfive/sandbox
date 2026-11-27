-- Pedir a inventario › archivar pedidos (23 nov 2026, pedido de Jhokser): un pedido ya realizado (entregado) o cancelado se puede archivar para sacarlo de la lista y se ve aparte en «Ver archivados».
-- Archivar no cambia el estado ni toca inventario: solo marca cuándo y quién. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0354_rollback.sql.

alter table despacho_pedidos_inventario
  add column if not exists archivado_en timestamptz,
  add column if not exists archivado_por uuid,
  add column if not exists archivado_por_nombre text;

create index if not exists despacho_pedidos_inventario_archivado on despacho_pedidos_inventario (archivado_en) where archivado_en is not null;

notify pgrst, 'reload schema';
