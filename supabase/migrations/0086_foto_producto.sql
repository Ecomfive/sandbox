-- Producto: la foto de cada producto (pedido de Hernán, 7 oct 2026). Se ve como miniatura en Producto y en Inventario. Las
-- primeras salen de la lista de ClickUp «Inventario 🇵🇦 Ecomfive Panamá» (campo «📸 Foto del Producto»), emparejadas por
-- nombre con `scripts/fotos-productos-clickup.ts`; el archivo queda en el bucket público `wms-productos`.
-- Se puede correr más de una vez.

alter table skus_maestros add column if not exists foto_url text;
