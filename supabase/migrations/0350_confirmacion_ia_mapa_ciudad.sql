-- Confirmación con IA › el mapa de la ciudad (23 nov 2026, pedido de Jhokser): el equipo pasó el documento «Zonas de Panamá con delivery» (las mismas 6 zonas que ya estaban) y un mapa con una línea roja: todo lo de adentro
-- es CIUDAD (incluida la punta hacia el mar: Amador, Isla Naos, Isla Flamenco) y todo lo de afuera es INTERIOR. Las zonas 5 y 6 quedan como CIUDAD por reglamento; una tendencia clara de la tienda sigue mandando sobre eso.
--   * Cambia las instrucciones de la IA de Panamá solo si siguen siendo EXACTAMENTE las que sembró la 0329 (si alguien las editó desde la pantalla, no se tocan).
--   * Palabras de zona nuevas: islas del Amador → ciudad; lugares que el mapa deja afuera y no se repiten con otro sitio → interior. No se siembran palabras para las zonas 5 y 6: mandarían sobre la tendencia de cada tienda.
--   * Dos direcciones de ejemplo generales, inventadas (nada de clientes).
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0350_rollback.sql.

update confirmacion_ia_config c
set instrucciones = 'REGLAS DE ZONA DE PANAMÁ (confirmadas por el equipo):
1) CIUDAD = las 6 zonas de delivery de la geografía y todo lo que queda dentro de la línea roja del mapa del equipo: desde Amador, Naos, Flamenco, Perico, Albrook y el centro hasta San Miguelito, Alcalde Díaz, Las Cumbres, Tocumen y Pacora. Todo lo que queda fuera de la línea es INTERIOR/Servientrega: todo Panamá Oeste (otro lado del Canal, Cocolí), Colón, Chepo, Chilibre, Panamá Norte, Pradera de San Lorenzo, Utivé y las provincias.
2) Orden: primero las palabras de zona del equipo; luego la TENDENCIA HISTÓRICA clara de la tienda (en las zonas 5 y 6 Kenku suele INTERIOR; Nuvo y Oferfy, CIUDAD); si la tendencia es mixta o no hay, manda el reglamento: delivery y mapa = CIUDAD, fuera = INTERIOR.
3) Pago por adelantado: Bocas del Toro, Changuinola, Puerto Armuelles, Darién, Bajo Boquete, El Empalme, Portobelo, María Chiquita y Paso Ancho de Chiriquí: responde «adelantado». Un barrio Paso Ancho en la ciudad es CIUDAD.
4) El campo de ciudad a veces dice solo «Panamá» (la provincia). Lee la dirección completa: si habla de La Chorrera, Arraiján, Colón, Chepo, Chitré, David u otro lugar del interior, es INTERIOR.
5) Nombres repetidos: Casa Blanca, La Loma, Balboa, Don Bosco, San Antonio, Las Américas, Amador, Miraflores, La Alameda, Llano Bonito, Pedregal (el de David) y Brisas del Golf (el de Arraiján) también existen en el interior. «Casa blanca» suele ser el color. Decide por la ciudad y el resto de la dirección.
6) Recoger en una oficina Servientrega (CDS): INTERIOR.
7) Ernesto Córdoba Campos y Cabra no se ven en el mapa: sin tendencia ni otra pista, «no_se». En Pacora, los sectores lejanos (Cabra, Santa Isabel, San Martín de Pacora) suelen ser INTERIOR.
8) Completa: lugar y punto exacto (calle y casa, edificio y apartamento, o referencia clara). Incompleta: solo barrio o ciudad, o un nombre suelto. En «falta» pide solo lo que falta, por ejemplo «el número de casa o una referencia».'
where c.pais_id = (select id from paises where codigo = 'PA')
  and c.instrucciones = 'REGLAS DE ZONA DE PANAMÁ (confirmadas por el equipo):
1) CIUDAD = zonas 1 a 4 de delivery de la geografía (Juan Díaz y Costa del Este; Lucre, Brisas y San Antonio; San Miguelito, Betania y Edison; centro y Ancón). Zonas 5 y 6 (Las Cumbres, Alcalde Díaz, Veranillo, Tocumen, Pacora, 24 de Diciembre, Pedregal): según la TENDENCIA HISTÓRICA de la tienda (Kenku suele INTERIOR; Nuvo y Oferfy, CIUDAD). Todo lo demás es INTERIOR/Servientrega: Panamá Oeste (Arraiján, La Chorrera, Chame, Vacamonte), Colón, Chepo, Chilibre, Panamá Pacífico y las provincias.
2) Pago por adelantado: Bocas del Toro, Changuinola, Puerto Armuelles, Darién, Bajo Boquete, El Empalme, Portobelo, María Chiquita y Paso Ancho de Chiriquí: responde «adelantado». Un barrio Paso Ancho en la ciudad es CIUDAD.
3) El campo de ciudad a veces dice solo «Panamá» (la provincia). Lee la dirección completa: si habla de La Chorrera, Arraiján, Colón, Chepo, Chitré, David u otro lugar del interior, es INTERIOR.
4) Nombres repetidos: Casa Blanca, La Loma, Balboa, Don Bosco, San Antonio, Las Américas, Amador, Miraflores, La Alameda, Llano Bonito, Pedregal (el de David) y Brisas del Golf (el de Arraiján) también existen en el interior. «Casa blanca» suele ser el color. Decide por la ciudad y el resto de la dirección.
5) Recoger en una oficina Servientrega (CDS): INTERIOR.
6) Lugares en discusión (Pan de Azúcar, Cerro Batea, Samaria, Cabima, Gonzalillo, Ciudad del Saber, Caimitillo, Ernesto Córdoba Campos, Cabra, Panamá Norte y los de las zonas 5 y 6): sigue la tendencia de la tienda. En Pacora, los sectores lejanos (Cabra, Santa Isabel, San Martín de Pacora) suelen ser INTERIOR. Si la tendencia es mixta o no hay datos y la dirección no aclara, «no_se»: lo revisan los asesores.
7) Completa: lugar y punto exacto (calle y casa, edificio y apartamento, o referencia clara). Incompleta: solo barrio o ciudad, o un nombre suelto. En «falta» pide solo lo que falta, por ejemplo «el número de casa o una referencia».';

insert into confirmacion_ia_zonas (pais_id, texto, clave, resultado, creado_por_nombre)
select p.id, v.texto, v.clave, v.resultado, 'Sistema'
from paises p
cross join (values
  ('Isla Naos', 'isla naos', 'ciudad'),
  ('Isla Flamenco', 'isla flamenco', 'ciudad'),
  ('Isla Perico', 'isla perico', 'ciudad'),
  ('Calzada de Amador', 'calzada de amador', 'ciudad'),
  ('Pradera de San Lorenzo', 'pradera de san lorenzo', 'interior'),
  ('El Caraño', 'el carano', 'interior'),
  ('Utivé', 'utive', 'interior'),
  ('Boca de Pacora', 'boca de pacora', 'interior'),
  ('Cocolí', 'cocoli', 'interior')
) as v (texto, clave, resultado)
where p.codigo = 'PA'
on conflict (pais_id, clave) do nothing;

insert into confirmacion_ia_ejemplos (pais_id, direccion, ciudad, completa, falta, zona, origen, creado_por_nombre)
select p.id, v.direccion, v.ciudad, true, null, v.zona, 'manual', 'Sistema'
from paises p
cross join (values
  ('Calzada de Amador, Isla Flamenco, local 12, frente al Biomuseo', 'Panamá', 'ciudad'),
  ('Comunidad Pradera de San Lorenzo, casa 9, junto a la capilla', 'Panamá', 'interior')
) as v (direccion, ciudad, zona)
where p.codigo = 'PA'
  and not exists (select 1 from confirmacion_ia_ejemplos e where e.pais_id = p.id and e.tienda_id is null and e.direccion = v.direccion);

notify pgrst, 'reload schema';
