-- Reversa de 0328: quita las palabras de zona y las direcciones de ejemplo que sembró «Sistema» y las instrucciones de Panamá si siguen siendo las de la migración.
delete from confirmacion_ia_zonas z using paises p
where z.pais_id = p.id and p.codigo = 'PA' and z.creado_por_nombre = 'Sistema'
  and z.clave in ('la chorrera','chorrera','arraijan','vacamonte','chame','capira','chepo','chilibre','panama pacifico','cristobal','cativa','sabanitas','herrera','los santos','chitre','las tablas','veraguas','cocle','penonome','aguadulce','chiriqui','bugaba',
    'chanis','ciudad radial','costa del este','juan diaz','villa lucre','bethania','betania','edison park','condado del rey','altos de panama','el doral','dos mares','calidonia','obarrio','paitilla','punta pacifica','el cangrejo','rio abajo','parque lefevre','hato pintado','12 de octubre','albrook','carrasquilla',
    'changuinola','bocas del toro','isla colon','puerto armuelles','bajo boquete','el empalme','portobelo','maria chiquita','darien');
delete from confirmacion_ia_ejemplos e using paises p
where e.pais_id = p.id and p.codigo = 'PA' and e.creado_por_nombre = 'Sistema' and e.origen = 'manual';
update confirmacion_ia_config c set instrucciones = null
where c.pais_id = (select id from paises where codigo = 'PA') and c.instrucciones like 'REGLAS DE ZONA DE PANAMÁ (confirmadas por el equipo):%';
notify pgrst, 'reload schema';
