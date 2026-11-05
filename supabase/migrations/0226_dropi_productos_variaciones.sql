-- Privatizar productos con variaciones (pedido de Hernán, 5 nov 2026): la lectura de «Mis productos» guarda las variaciones de cada producto
-- VARIABLE activo con su stock por bodega, para que «Privatizar en Dropi» pida las unidades de cada una.
-- Cada una: { "firma": "graduacion=1 50", "etiqueta": "+1.50", "sku": "LENTES/150", "bodegas": [{ "id": 81, "stock": 70 }] }.
-- null = esa lectura no las trajo (un producto simple, un archivado o una lectura anterior).

alter table dropi_productos_proveedor add column if not exists variaciones jsonb;
