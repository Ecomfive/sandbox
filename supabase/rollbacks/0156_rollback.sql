-- Reversa de 0156_scraping_ya_lo_tenemos.sql: los productos marcados «Ya lo tenemos» vuelven a la lista de recomendados.
alter table scraping_productos
  drop column if exists descartado_en,
  drop column if exists descartado_por,
  drop column if exists descartado_motivo;
