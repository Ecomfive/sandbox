-- Envío del producto (como el bloque «Envío» de la ficha de Shopify): si es un producto físico que se envía y, entonces,
-- su embalaje, el tamaño ya empacado (largo × ancho × alto), el peso, el país de origen y el código del Sistema Armonizado
-- (SA/HS) para aduanas. Si no es físico (un servicio, algo digital), los datos se conservan pero no se usan.
-- Todo es opcional y sin datos queda como antes: no cambia nada del stock.

alter table skus_maestros
  add column if not exists es_fisico boolean not null default true,
  add column if not exists embalaje text,
  add column if not exists largo numeric(10, 2),
  add column if not exists ancho numeric(10, 2),
  add column if not exists alto numeric(10, 2),
  add column if not exists unidad_medida text not null default 'cm',
  add column if not exists peso numeric(12, 3),
  add column if not exists unidad_peso text not null default 'kg',
  add column if not exists pais_origen text,
  add column if not exists codigo_sa text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'skus_maestros_envio_valido') then
    alter table skus_maestros add constraint skus_maestros_envio_valido check (
      unidad_medida in ('cm', 'in')
      and unidad_peso in ('kg', 'g', 'lb', 'oz')
      and (largo is null or largo >= 0)
      and (ancho is null or ancho >= 0)
      and (alto is null or alto >= 0)
      and (peso is null or peso >= 0)
      and (embalaje is null or char_length(embalaje) <= 120)
      and (pais_origen is null or char_length(pais_origen) <= 80)
      and (codigo_sa is null or codigo_sa ~ '^[0-9]{4}([.]?[0-9]{2}){0,3}$')
    );
  end if;
end $$;
