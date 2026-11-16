-- Portal del proveedor: cajas y etiqueta de las cajas de un envío (16 nov 2026, pedido de Hernán: Shen Zhen manda en su hoja el número de cajas —«Cartons»— y la
-- etiqueta de las cajas de cada pedido). `cajas` es cuántas cajas lleva el envío; `etiquetas_rutas` son las imágenes de la etiqueta que subió el proveedor (bucket privado
-- `proveedor-portal`, carpeta `<proveedor>/<pedido>/etiquetas/`). El disparador `proveedor_sincronizar` no toca estas columnas (su `on conflict` solo actualiza las suyas).
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0299_rollback.sql.
alter table proveedor_pedidos add column if not exists cajas integer check (cajas is null or cajas > 0);
alter table proveedor_pedidos add column if not exists etiquetas_rutas text[] not null default '{}';

notify pgrst, 'reload schema';
