-- Las métricas de Meta Ads que se usan para decidir cuánto pedir de cada producto candidato: el link de la
-- landing y la tabla que trae cada tarea de ClickUp (Oferta, CPM, % Efectividad, Hook Rate, CTR, CPA,
-- Gasto, Compras, CVR). Todo nullable porque no todos los productos llegaron a probarse en Meta todavía.

alter table wms_filtro_productos
  add column landing_url text,
  add column metrica_oferta numeric(12, 2),
  add column metrica_cpm numeric(12, 2),
  add column metrica_efectividad numeric(5, 2),
  add column metrica_hook_rate numeric(5, 2),
  add column metrica_ctr numeric(5, 2),
  add column metrica_cpa numeric(12, 2),
  add column metrica_gasto numeric(12, 2),
  add column metrica_compras integer,
  add column metrica_cvr numeric(5, 2);
