-- Bolso Nayla: Negro y Azul pasan al producto base Nayla (9 nov 2026, pedido de Jhokser).
--
-- La ficha de Shopify «Bolso Premium Nayla» vende Negro, Verde, Morado, Azul y Marrón, pero en el sistema Verde y Púrpura colgaban del producto base
-- «Bolso NAYLA de gran capacidad» (BOLSO/NAYLA/GRAN) y Negro (#285) y Azul (#288) de «Bolso Gran Capacidad» (BOLSO/GRAN/CAPACIDAD), que es el mismo
-- modelo. Aquí Negro y Azul pasan al base Nayla, con Color: Negro y Color: Azul. Conservan su id, N.º, SKU (BOLSO/GRAN/CAPACIDAD/NEGRO y /AZUL),
-- código de barras, stock, compras y fichas: el SKU que ya tienen en Shopify no cambia. Después se recalculan los valores de Color de los dos
-- productos base a partir de sus variantes (el de Gran Capacidad se queda con Lila, Gris y Verde).
--
--   * No hace nada si el producto base Nayla no existe o si alguna de las dos ya cuelga de él.
--   * Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0262_rollback.sql

update skus_maestros h
   set padre_id = (select id from skus_maestros where upper(codigo) = 'BOLSO/NAYLA/GRAN' and opciones_variantes is not null),
       opciones = jsonb_build_object('Color', case upper(h.codigo) when 'BOLSO/GRAN/CAPACIDAD/NEGRO' then 'Negro' else 'Azul' end)
 where upper(h.codigo) in ('BOLSO/GRAN/CAPACIDAD/NEGRO', 'BOLSO/GRAN/CAPACIDAD/AZUL')
   and exists (select 1 from skus_maestros where upper(codigo) = 'BOLSO/NAYLA/GRAN' and opciones_variantes is not null)
   and h.padre_id is distinct from (select id from skus_maestros where upper(codigo) = 'BOLSO/NAYLA/GRAN' and opciones_variantes is not null);

-- Los valores de Color de cada producto base salen de sus variantes.
update skus_maestros p
   set opciones_variantes = jsonb_build_array(jsonb_build_object('nombre', 'Color', 'valores',
         (select jsonb_agg(h.opciones->>'Color' order by h.codigo) from skus_maestros h where h.padre_id = p.id)))
 where upper(p.codigo) in ('BOLSO/NAYLA/GRAN', 'BOLSO/GRAN/CAPACIDAD')
   and exists (select 1 from skus_maestros h where h.padre_id = p.id);

-- Cómo quedó: cada producto base con sus variantes.
select p.codigo as base, p.opciones_variantes as opciones,
       (select string_agg(h.codigo || ' (' || coalesce(h.opciones->>'Color', '') || ')', ', ' order by h.codigo) from skus_maestros h where h.padre_id = p.id) as variantes
  from skus_maestros p
 where upper(p.codigo) in ('BOLSO/NAYLA/GRAN', 'BOLSO/GRAN/CAPACIDAD');
