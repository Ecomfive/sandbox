-- Reversa de 0329: quita los ejemplos por tienda que sembró «Sistema» (Tocumen y Las Cumbres de Kenku, Oferfy y Nuvo) y vuelve a dejar el ejemplo general de Tocumen. Las instrucciones de la IA no se devuelven: se editan desde la pantalla.
delete from confirmacion_ia_ejemplos e using paises p
where e.pais_id = p.id and p.codigo = 'PA' and e.creado_por_nombre = 'Sistema' and e.tienda_id is not null
  and e.direccion in ('Barriada La Siesta, calle Veraguas, casa 2735, portón verde', 'Villa Zaita, Pradera del Rocío, casa C42, entrando por el Arrocha');
insert into confirmacion_ia_ejemplos (pais_id, direccion, ciudad, completa, zona, origen, creado_por_nombre)
select p.id, 'Barriada La Siesta, calle Veraguas, casa 2735, portón verde', 'Tocumen', true, 'ciudad', 'manual', 'Sistema'
from paises p where p.codigo = 'PA'
  and not exists (select 1 from confirmacion_ia_ejemplos e where e.pais_id = p.id and e.tienda_id is null and e.direccion = 'Barriada La Siesta, calle Veraguas, casa 2735, portón verde');
notify pgrst, 'reload schema';
