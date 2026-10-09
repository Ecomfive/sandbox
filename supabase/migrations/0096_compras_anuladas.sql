-- Compras: «Anular» en vez de borrar (pedido de Hernán, 9 oct 2026). Una compra anulada no se borra: conserva su N.º OC, su
-- código ECOM, su actividad, sus comentarios y sus productos, pero sale de la lista (se ve con «Anuladas») y deja de contar
-- en el informe, el dashboard, los tiempos, los envíos y el histórico de compras de los productos. Se puede restaurar.
-- Se corre ANTES de publicar el código que la usa (la lista ya pregunta por `anulada_en`).

alter table wms_compras add column if not exists anulada_en timestamptz;
alter table wms_compras add column if not exists anulada_por text;
alter table wms_compras add column if not exists motivo_anulacion text;
create index if not exists wms_compras_anuladas_idx on wms_compras (anulada_en) where anulada_en is not null;
