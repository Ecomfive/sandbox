-- Confirmación con IA › zonas de Panamá (18 nov 2026, pedido de Jhokser, con el documento «Zonas de envío con Delivery» y la lista de Servientrega del equipo, y los pedidos de octubre y noviembre de Kenku, Nuvo y Oferfy).
--   * Palabras de zona de Panamá que casi nunca fallan en los pedidos reales: lo del interior (La Chorrera, Arraiján, Chepo, Colón…) → interior; barrios del delivery sin nombre repetido → ciudad; y los lugares de pago por adelantado → adelantado.
--     No se agrega ninguna palabra de las zonas 5 y 6 (Las Cumbres, Tocumen, Pacora…) ni de lo que sale en las dos listas: Kenku las etiqueta INTERIOR y Nuvo y Oferfy CIUDAD, así que las define el equipo.
--   * Instrucciones de la IA de Panamá (solo si todavía no hay ninguna): las reglas de zona y de dirección completa que salen de ese análisis. Un administrador las puede cambiar desde la pantalla.
--   * Direcciones de ejemplo inventadas (nombres de lugares reales, números y referencias inventados): cubren los casos que más se confunden. No lleva ningún dato de ningún cliente.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0328_rollback.sql.

insert into confirmacion_ia_zonas (pais_id, texto, clave, resultado, creado_por_nombre)
select p.id, v.texto, v.clave, v.resultado, 'Sistema'
from paises p
cross join (values
  -- Interior (Panamá Oeste, Colón, Chepo y las provincias): en los pedidos reales casi todos salen INTERIOR.
  ('La Chorrera', 'la chorrera', 'interior'),
  ('Chorrera', 'chorrera', 'interior'),
  ('Arraiján', 'arraijan', 'interior'),
  ('Vacamonte', 'vacamonte', 'interior'),
  ('Chame', 'chame', 'interior'),
  ('Capira', 'capira', 'interior'),
  ('Chepo', 'chepo', 'interior'),
  ('Chilibre', 'chilibre', 'interior'),
  ('Panamá Pacífico', 'panama pacifico', 'interior'),
  ('Cristóbal', 'cristobal', 'interior'),
  ('Cativá', 'cativa', 'interior'),
  ('Sabanitas', 'sabanitas', 'interior'),
  ('Herrera', 'herrera', 'interior'),
  ('Los Santos', 'los santos', 'interior'),
  ('Chitré', 'chitre', 'interior'),
  ('Las Tablas', 'las tablas', 'interior'),
  ('Veraguas', 'veraguas', 'interior'),
  ('Coclé', 'cocle', 'interior'),
  ('Penonomé', 'penonome', 'interior'),
  ('Aguadulce', 'aguadulce', 'interior'),
  ('Chiriquí', 'chiriqui', 'interior'),
  ('Bugaba', 'bugaba', 'interior'),
  -- Ciudad (zonas de delivery cuyo nombre no se repite en el interior).
  ('Chanis', 'chanis', 'ciudad'),
  ('Ciudad Radial', 'ciudad radial', 'ciudad'),
  ('Costa del Este', 'costa del este', 'ciudad'),
  ('Juan Díaz', 'juan diaz', 'ciudad'),
  ('Villa Lucre', 'villa lucre', 'ciudad'),
  ('Bethania', 'bethania', 'ciudad'),
  ('Betania', 'betania', 'ciudad'),
  ('Edison Park', 'edison park', 'ciudad'),
  ('Condado del Rey', 'condado del rey', 'ciudad'),
  ('Altos de Panamá', 'altos de panama', 'ciudad'),
  ('El Doral', 'el doral', 'ciudad'),
  ('Dos Mares', 'dos mares', 'ciudad'),
  ('Calidonia', 'calidonia', 'ciudad'),
  ('Obarrio', 'obarrio', 'ciudad'),
  ('Paitilla', 'paitilla', 'ciudad'),
  ('Punta Pacífica', 'punta pacifica', 'ciudad'),
  ('El Cangrejo', 'el cangrejo', 'ciudad'),
  ('Río Abajo', 'rio abajo', 'ciudad'),
  ('Parque Lefevre', 'parque lefevre', 'ciudad'),
  ('Hato Pintado', 'hato pintado', 'ciudad'),
  ('12 de Octubre', '12 de octubre', 'ciudad'),
  ('Albrook', 'albrook', 'ciudad'),
  ('Carrasquilla', 'carrasquilla', 'ciudad'),
  -- Pago por adelantado (zonas de difícil acceso o cerca de la frontera). «Paso Ancho» no va: también es un barrio de la ciudad.
  ('Changuinola', 'changuinola', 'adelantado'),
  ('Bocas del Toro', 'bocas del toro', 'adelantado'),
  ('Isla Colón', 'isla colon', 'adelantado'),
  ('Puerto Armuelles', 'puerto armuelles', 'adelantado'),
  ('Bajo Boquete', 'bajo boquete', 'adelantado'),
  ('El Empalme', 'el empalme', 'adelantado'),
  ('Portobelo', 'portobelo', 'adelantado'),
  ('María Chiquita', 'maria chiquita', 'adelantado'),
  ('Darién', 'darien', 'adelantado')
) as v (texto, clave, resultado)
where p.codigo = 'PA'
on conflict (pais_id, clave) do nothing;

-- Instrucciones de la IA de Panamá (hasta 2000 letras; no pisa las que ya haya).
update confirmacion_ia_config c
set instrucciones = 'REGLAS DE ZONA DE PANAMÁ (confirmadas por el equipo):
1) CIUDAD = las 6 zonas de delivery que trae la geografía (Juan Díaz y Costa del Este; Lucre, Brisas y San Antonio; San Miguelito, Betania y Edison; centro y Ancón; Norte; Este hasta Tocumen y Pacora). Todo lo demás es INTERIOR/Servientrega: Panamá Oeste (Arraiján, La Chorrera, Chame, Vacamonte), Colón, Chepo, Chilibre, Panamá Pacífico y las provincias.
2) Pago por adelantado: Bocas del Toro, Changuinola, Puerto Armuelles, Darién, Bajo Boquete, El Empalme, Portobelo, María Chiquita y Paso Ancho de Chiriquí. Responde «adelantado». Un barrio llamado Paso Ancho en la ciudad es CIUDAD.
3) El campo de ciudad a veces dice solo «Panamá» (la provincia). Lee la dirección completa: si habla de La Chorrera, Arraiján, Colón, Chepo, Chitré, David u otro lugar del interior, es INTERIOR.
4) Nombres repetidos: Casa Blanca, La Loma, Balboa, Don Bosco, San Antonio, Las Américas, Amador, Miraflores, La Alameda, Llano Bonito y Brisas del Golf también existen en el interior (Brisas del Golf de Arraiján). «Casa blanca» suele ser el color de la casa. Decide por la ciudad y el resto de la dirección.
5) Si el cliente pide recoger en una oficina Servientrega (CDS, «Servientrega»), es INTERIOR.
6) Lugares en discusión (Las Cumbres, Alcalde Díaz, Pan de Azúcar, Cerro Batea, Samaria, Cabima, Gonzalillo, Veranillo, Ciudad del Saber, Caimitillo, Ernesto Córdoba Campos, Cabra, Panamá Norte): si no hay otra pista, responde «no_se».
7) Completa: lugar y punto exacto (calle y casa, edificio y apartamento, o referencia clara). Incompleta: solo barrio o ciudad, o un nombre suelto. En «falta» pide solo lo que falta, por ejemplo «el número de casa o una referencia».'
where c.instrucciones is null
  and c.pais_id = (select id from paises where codigo = 'PA');

-- Direcciones de ejemplo (inventadas) para Panamá. No se repiten si la migración se corre otra vez.
insert into confirmacion_ia_ejemplos (pais_id, direccion, ciudad, completa, falta, zona, origen, creado_por_nombre)
select p.id, v.direccion, v.ciudad, v.completa, v.falta, v.zona, 'manual', 'Sistema'
from paises p
cross join (values
  ('Calle 47 Este, Edificio Torre Alba, apartamento 12B, frente al Banco General', 'Bella Vista', true, null, 'ciudad'),
  ('Barriada Altos del Romeral, calle 3, casa 45, portón negro, a dos casas de la tienda', 'Juan Díaz', true, null, 'ciudad'),
  ('PH Costa Verde, torre 2, apartamento 7C, calle Cerro Alegre', 'Costa del Este', true, null, 'ciudad'),
  ('Calle 12, casa 214, entrando por el Super 99, casa de rejas blancas', 'Villa Lucre', true, null, 'ciudad'),
  ('Urbanización Dorado Springs, calle 5, casa 18, frente a la parada de buses', 'San Miguelito', true, null, 'ciudad'),
  ('Barriada La Siesta, calle Veraguas, casa 2735, portón verde', 'Tocumen', true, null, 'ciudad'),
  ('Calle 70 Este, casa 33-B, detrás de la iglesia', 'Panamá', true, null, 'ciudad'),
  ('Edificio Global Plaza, piso 12, oficina 1204, Calle 50', 'Panamá', true, null, 'ciudad'),
  ('La Chorrera, barriada Santa Rosa, calle 4, casa 52, frente a la escuela', 'Panamá', true, null, 'interior'),
  ('Brisas del Golf, calle 19, casa F-111, entrando por el Super 99', 'Arraiján', true, null, 'interior'),
  ('Comunidad Viento Frío, casa 12, junto a la junta comunal', 'Chilibre', true, null, 'interior'),
  ('Edificio Plaza Las Américas, local 4, frente a la bomba de gasolina', 'David', true, null, 'interior'),
  ('Barrio Balboa, calle Odelay, casa 748-F, casa naranja', 'La Chorrera', true, null, 'interior'),
  ('Hospital Manuel Amador Guerrero, primer piso, dirección médica', 'Colón', true, null, 'interior'),
  ('Barriada Casa Blanca, calle 2, casa 14, al lado del taller', 'Santiago', true, null, 'interior'),
  ('Recoger en Servientrega, CDS Mañanitas, Plaza Los Pinos, local 5', 'Panamá', true, null, 'interior'),
  ('Barrio Mojica, casa 33, frente al parque', 'Changuinola', true, null, 'adelantado'),
  ('Barriada Las Palmas, casa 10, frente a la escuela', 'Puerto Armuelles', true, null, 'adelantado'),
  ('Bella Vista', 'Bella Vista', false, 'la calle, el edificio o la casa y una referencia', null),
  ('Por Costa del Este', 'Costa del Este', false, 'el nombre del PH o edificio con el apartamento, o una referencia', null),
  ('Barrio Colón', 'La Chorrera', false, 'el número de casa o una referencia (por ejemplo, un comercio o una escuela cercana)', null),
  ('Casa 25', 'San Miguelito', false, 'el sector o barriada y una referencia', null),
  ('Tocumen, casa color azul', 'Tocumen', false, 'la barriada o calle y el número de casa', null),
  ('David', 'David', false, 'el barrio o la barriada, el número de casa y una referencia', null),
  ('Cerca del Super 99', 'Panamá', false, 'el corregimiento o barrio y la calle o el número de casa', null),
  ('Villas del Rey', 'Arraiján', false, 'la calle y el número de casa o una referencia', null)
) as v (direccion, ciudad, completa, falta, zona)
where p.codigo = 'PA'
  and not exists (select 1 from confirmacion_ia_ejemplos e where e.pais_id = p.id and e.direccion = v.direccion and coalesce(e.ciudad, '') = v.ciudad);

notify pgrst, 'reload schema';
