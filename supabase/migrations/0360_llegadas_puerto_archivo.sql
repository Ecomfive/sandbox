-- Llegadas a puerto › archivar lo que ya se recibió (24 nov 2026, pedido de Logística): una compra que ya llegó y se recibió sale de la lista de pendientes y se ve aparte en «Archivadas».
-- Archivar no cambia la etapa de la compra ni borra nada: solo marca cuándo y quién, en las filas de la llegada (`compras_llegada_items`). Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0360_rollback.sql.

alter table compras_llegada_items
  add column if not exists archivado_en timestamptz,
  add column if not exists archivado_por uuid,
  add column if not exists archivado_por_nombre text;

create index if not exists compras_llegada_items_archivado on compras_llegada_items (archivado_en) where archivado_en is not null;

notify pgrst, 'reload schema';
