-- Reversa de 0262_bolso_nayla_negro_azul.sql: Negro y Azul vuelven a colgar de «Bolso Gran Capacidad».
update skus_maestros h
   set padre_id = (select id from skus_maestros where upper(codigo) = 'BOLSO/GRAN/CAPACIDAD' and opciones_variantes is not null)
 where upper(h.codigo) in ('BOLSO/GRAN/CAPACIDAD/NEGRO', 'BOLSO/GRAN/CAPACIDAD/AZUL')
   and exists (select 1 from skus_maestros where upper(codigo) = 'BOLSO/GRAN/CAPACIDAD' and opciones_variantes is not null);

update skus_maestros p
   set opciones_variantes = jsonb_build_array(jsonb_build_object('nombre', 'Color', 'valores',
         (select jsonb_agg(h.opciones->>'Color' order by h.codigo) from skus_maestros h where h.padre_id = p.id)))
 where upper(p.codigo) in ('BOLSO/NAYLA/GRAN', 'BOLSO/GRAN/CAPACIDAD')
   and exists (select 1 from skus_maestros h where h.padre_id = p.id);
