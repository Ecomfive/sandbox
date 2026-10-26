-- Scraping de proveedores › «Ya lo tenemos» (pedido de Hernán, 26 oct 2026): un producto de un proveedor referente que se parece a
-- algo nuestro (o que ya tenemos con otro nombre) se puede sacar de la lista de recomendados con un botón. Queda marcado aquí
-- (quién, cuándo y con qué lo tenemos), pasa a «Ya lo tenemos» y no vuelve a salir aunque siga vendiéndose. Se puede deshacer.
-- Las búsquedas diarias no tocan estas columnas. Reversa: supabase/rollbacks/0156_rollback.sql

alter table scraping_productos
  add column if not exists descartado_en timestamptz,
  add column if not exists descartado_por text,
  -- Con qué lo tenemos o por qué se sacó («Se parece a «Drenaje Linfático (60 cápsulas)» (ya comprado)»).
  add column if not exists descartado_motivo text;
