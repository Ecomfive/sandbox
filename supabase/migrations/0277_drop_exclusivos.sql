-- Drop: los exclusivos de cada producto (12 nov 2026, pedido de Hernán: «los exclusivos en Drop también deben salir en stock de bodega»). Lo que Drop
-- guarda aparte para un cliente («Producto exclusivo» en la ficha del producto) no entra en el «Inventario» de «Mis productos», pero es stock nuestro en
-- la bodega de Drop. La extensión 0.7.2 lo lee de la ficha de cada producto: `exclusivos` guarda cada cliente (cliente, variante, cantidad, activo) e
-- `inventario_exclusivo` la suma de los activos. Se puede correr más de una vez.
-- Reversa: supabase/rollbacks/0277_rollback.sql

alter table drop_publicaciones add column if not exists inventario_exclusivo integer check (inventario_exclusivo is null or inventario_exclusivo >= 0);
alter table drop_publicaciones add column if not exists exclusivos jsonb;

notify pgrst, 'reload schema';
