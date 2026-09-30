-- Compras: la foto del producto («📸 Foto del Producto» en ClickUp) — igual que en Filtros, en el mismo
-- bucket público (wms-productos), para poder migrar el historial completo de «Compras Dropi PA Panamá».
alter table wms_compras add column if not exists foto_url text;
