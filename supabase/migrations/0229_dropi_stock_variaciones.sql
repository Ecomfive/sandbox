-- Gestión de IDs Dropi › stock de un producto con variaciones (pedido de Hernán, 5 nov 2026): cada variación se cambia por su lado, así que en una misma bodega puede haber
-- varios cambios esperando «Aplicar en Dropi» (`datos.firma` = qué variación; ver src/lib/publicaciones/stock-dropi.ts › DatosStock). Un producto simple no lleva `firma`.
-- El índice de antes permitía uno solo por publicación y bodega; este también separa los dos IDs de una publicación («6667-8295»).
-- Código: src/lib/publicaciones/stock-dropi.ts, cambios-dropi.ts (encolarStock).
-- Reversa: supabase/rollbacks/0229_rollback.sql

drop index if exists dropi_cambios_pendientes_stock_idx;
create unique index if not exists dropi_cambios_pendientes_stock_idx
  on dropi_cambios_pendientes (publicacion_id, dropi_producto_id, (datos ->> 'bodega'), coalesce(datos ->> 'firma', '')) where tipo = 'stock' and estado in ('pendiente', 'error');
