-- Confirmación con IA › Costa Rica (19 nov 2026, pedido de Jhokser, con el Excel «Codificación - Cantón - Provincia - Distrito - Barrio» del equipo). Todavía no hay ninguna tienda de Costa Rica: queda montado y apagado.
--   * Configuración de Costa Rica: distingue ciudad de interior y usa las etiquetas CIUDAD-GAM e INTERIOR-ZONAS-ALEJADAS. No toca `activa` ni `enviar_mensajes` (siguen como estén; de entrada, apagados).
--     «CONFIRMADO» y «DROP» no las pone este módulo: la primera la pone el bot de iComfly y la segunda la asesora de la transportadora.
--   * Instrucciones de la IA de Costa Rica (solo si todavía no hay ninguna).
--   * Direcciones de ejemplo inventadas (nombres de lugares reales, señas inventadas): ninguna es de un cliente.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0330_rollback.sql.

insert into confirmacion_ia_config (pais_id, distingue_zona, etiqueta_ciudad, etiqueta_interior)
select id, true, 'CIUDAD-GAM', 'INTERIOR-ZONAS-ALEJADAS' from paises where codigo = 'CR'
on conflict (pais_id) do update
set distingue_zona = true, etiqueta_ciudad = excluded.etiqueta_ciudad, etiqueta_interior = excluded.etiqueta_interior, actualizado_en = now();

update confirmacion_ia_config c
set instrucciones = 'REGLAS DE ZONA DE COSTA RICA (confirmadas por el equipo):
1) Hay dos etiquetas: CIUDAD-GAM (la Gran Área Metropolitana) e INTERIOR-ZONAS-ALEJADAS. Las dos se envían con la misma transportadora: solo cambia la etiqueta. No hay pago por adelantado: nunca respondas «adelantado».
2) CIUDAD-GAM es SOLO esto: los 11 cantones de San José (San José, Escazú, Desamparados, Goicoechea, Santa Ana, Alajuelita, Vásquez de Coronado, Tibás, Moravia, Montes de Oca y Curridabat) en todos sus distritos; y, en el cantón de Alajuela, los distritos Alajuela, San José, Carrizal, San Antonio, Guácima, Río Segundo, Desamparados, Tambor, Garita y Turrúcares (en el distrito San José, el barrio Santa Rita es interior).
3) Todo lo demás es INTERIOR-ZONAS-ALEJADAS: el resto de San José (Puriscal, Tarrazú, Aserrí, Mora, Acosta, Turrubares, Dota, Pérez Zeledón, León Cortés Castro), los demás distritos del cantón de Alajuela (San Isidro, Sabanilla, San Rafael, Sarapiquí), los demás cantones de Alajuela, y toda Cartago, Heredia, Guanacaste, Puntarenas y Limón.
4) Decide por provincia, cantón y distrito juntos. Los nombres se repiten: San Rafael es ciudad en Escazú pero interior en Heredia y en Alajuela; San Antonio es ciudad en Escazú, Desamparados y Alajuela pero interior en Belén; San Isidro es ciudad en Coronado pero interior en Heredia. «San José» como provincia no basta.
5) Si falta el cantón, o es el de Alajuela sin distrito, responde «no_se».
6) Completa: provincia, cantón, distrito y señas exactas (calle, casa, color, referencia). Incompleta: falta el cantón o el distrito, o no hay señas. En «falta» pide solo lo que falta.'
where c.pais_id = (select id from paises where codigo = 'CR')
  and c.instrucciones is null;

insert into confirmacion_ia_ejemplos (pais_id, direccion, ciudad, completa, falta, zona, origen, creado_por_nombre)
select p.id, v.direccion, v.ciudad, v.completa, v.falta, v.zona, 'manual', 'Sistema'
from paises p
cross join (values
  ('Provincia San José, cantón Escazú, distrito San Rafael, 200 metros sur del Multiplaza, casa blanca con portón negro', 'Escazú', true, null, 'ciudad'),
  ('Provincia San José, cantón Desamparados, distrito San Antonio, urbanización Los Pinos, casa 14, frente a la parada de buses', 'Desamparados', true, null, 'ciudad'),
  ('Provincia San José, cantón Curridabat, distrito Sánchez, del Walmart 300 metros este, apartamento 3B', 'Curridabat', true, null, 'ciudad'),
  ('Provincia Alajuela, cantón Alajuela, distrito Río Segundo, residencial Las Palmas, casa 27, portón gris', 'Alajuela', true, null, 'ciudad'),
  ('Provincia Alajuela, cantón Alajuela, distrito San Isidro, 100 metros norte de la iglesia, casa de dos pisos color crema', 'Alajuela', true, null, 'interior'),
  ('Provincia Heredia, cantón Belén, distrito San Antonio, frente a la plaza de deportes, casa verde con reja', 'Belén', true, null, 'interior'),
  ('Provincia Heredia, cantón Heredia, distrito Mercedes, residencial Los Lagos, casa 8, portón negro', 'Heredia', true, null, 'interior'),
  ('Provincia Cartago, cantón Cartago, distrito Oriental, 50 metros oeste de la basílica, edificio azul, local 2', 'Cartago', true, null, 'interior'),
  ('Provincia San José, cantón Pérez Zeledón, distrito San Isidro de El General, del parque 200 metros sur, casa amarilla', 'Pérez Zeledón', true, null, 'interior'),
  ('Provincia Guanacaste, cantón Liberia, distrito Liberia, barrio El Capulín, casa 15, frente al supermercado', 'Liberia', true, null, 'interior'),
  ('Provincia Puntarenas, cantón Puntarenas, distrito Chacarita, 100 metros este de la escuela, casa celeste', 'Puntarenas', true, null, 'interior'),
  ('Provincia Limón, cantón Limón, distrito Limón, barrio Roosevelt, casa 4, al lado de la pulpería', 'Limón', true, null, 'interior'),
  ('Escazú', 'Escazú', false, 'el distrito y las señas exactas (calle, casa o una referencia)', null),
  ('San José', 'San José', false, 'el cantón, el distrito y las señas exactas', null),
  ('Alajuela, cantón Alajuela', 'Alajuela', false, 'el distrito y las señas exactas', null),
  ('Heredia, casa de dos pisos cerca de la iglesia', 'Heredia', false, 'el cantón y el distrito', null),
  ('Casa 15 al lado de la pulpería', 'Cartago', false, 'el cantón y el distrito, y una seña más clara (calle o referencia)', null)
) as v (direccion, ciudad, completa, falta, zona)
where p.codigo = 'CR'
  and not exists (select 1 from confirmacion_ia_ejemplos e where e.pais_id = p.id and e.direccion = v.direccion and coalesce(e.ciudad, '') = v.ciudad);

notify pgrst, 'reload schema';
