-- Reversa de 0259_agrupar_variantes_sueltas.sql: las variantes vuelven a ser productos sueltos y se quitan los productos base creados
-- (solo si no tienen movimientos de inventario). Los productos que eran variantes no pierden nada.
update skus_maestros set padre_id = null, opciones = null
 where padre_id in (
   select id from skus_maestros where codigo in (
     'BANDA/EJERCICIO/PEDALES', 'BASE/MAQUILLAJE/ZEPHOCO', 'BOLSO/NAYLA/GRAN', 'BOLSO/GRAN/CAPACIDAD', 'BOLSO/BANDOLERO/MULTICHIC',
     'BOLSO/CRUZADO/MUJER', 'ARETES/COLOR', 'BRAZALETES/COLOR', 'CALCETIN/COBREVIDA', 'BRASIER/BELLARISE', 'BRAGA/ENCAJE',
     'PANTY/COMPRESION/CRUZADA', 'ZAPATOS/ACUATICOS'));
delete from skus_maestros
 where codigo in (
     'BANDA/EJERCICIO/PEDALES', 'BASE/MAQUILLAJE/ZEPHOCO', 'BOLSO/NAYLA/GRAN', 'BOLSO/GRAN/CAPACIDAD', 'BOLSO/BANDOLERO/MULTICHIC',
     'BOLSO/CRUZADO/MUJER', 'ARETES/COLOR', 'BRAZALETES/COLOR', 'CALCETIN/COBREVIDA', 'BRASIER/BELLARISE', 'BRAGA/ENCAJE',
     'PANTY/COMPRESION/CRUZADA', 'ZAPATOS/ACUATICOS')
   and not exists (select 1 from wms_movimientos m where m.sku_maestro_id = skus_maestros.id);
drop function if exists wms_agrupar_como_variantes(text, text, text, jsonb, boolean);
