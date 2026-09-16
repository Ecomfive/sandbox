-- El pistoleo de bodega registra entradas/salidas físicas por SKU, sin que
-- todavía se sepa en qué plataforma se vende ese producto (eso lo resuelve
-- después la extracción de Dropi). Se relaja el esquema de productos para
-- permitir crearlos solo con SKU + país cuando vienen de esa vía.
alter table productos alter column plataforma_id drop not null;

-- La unicidad (pais, plataforma, sku) no protege contra duplicados cuando
-- plataforma_id es null (Postgres no compara NULLs como iguales), así que
-- se agrega un índice único parcial solo para ese caso.
create unique index if not exists productos_pais_sku_sin_plataforma_idx
  on productos (pais_id, sku)
  where plataforma_id is null;
