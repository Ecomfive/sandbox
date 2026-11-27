-- Pedidos de despacho: «En proceso» por producto (27 nov 2026, pedido de Hernán). Inventario marca lo que ya se está preparando (un producto o toda una bodega)
-- y eso se oculta de lo pendiente, con «Ver pedido completo» para verlo todo. Marcar el primero pone el pedido «En proceso». No mueve inventario.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0371_rollback.sql

alter table despacho_pedidos_inventario_items add column if not exists en_proceso_en timestamptz;
alter table despacho_pedidos_inventario_items add column if not exists en_proceso_por uuid;
alter table despacho_pedidos_inventario_items add column if not exists en_proceso_por_nombre text;

notify pgrst, 'reload schema';

-- Revisión: debe decir «en proceso por producto listo».
select case when count(*) = 3 then 'en proceso por producto listo' else 'FALTAN columnas' end as revision
from information_schema.columns
where table_name = 'despacho_pedidos_inventario_items' and column_name in ('en_proceso_en', 'en_proceso_por', 'en_proceso_por_nombre');
