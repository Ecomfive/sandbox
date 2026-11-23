-- Reversa de 0350: quita las palabras de zona y los ejemplos que sembró «Sistema» y devuelve las instrucciones de la 0329 (solo si siguen siendo las de la 0350).
update confirmacion_ia_config c
set instrucciones = 'REGLAS DE ZONA DE PANAMÁ (confirmadas por el equipo):
1) CIUDAD = zonas 1 a 4 de delivery de la geografía (Juan Díaz y Costa del Este; Lucre, Brisas y San Antonio; San Miguelito, Betania y Edison; centro y Ancón). Zonas 5 y 6 (Las Cumbres, Alcalde Díaz, Veranillo, Tocumen, Pacora, 24 de Diciembre, Pedregal): según la TENDENCIA HISTÓRICA de la tienda (Kenku suele INTERIOR; Nuvo y Oferfy, CIUDAD). Todo lo demás es INTERIOR/Servientrega: Panamá Oeste (Arraiján, La Chorrera, Chame, Vacamonte), Colón, Chepo, Chilibre, Panamá Pacífico y las provincias.
2) Pago por adelantado: Bocas del Toro, Changuinola, Puerto Armuelles, Darién, Bajo Boquete, El Empalme, Portobelo, María Chiquita y Paso Ancho de Chiriquí: responde «adelantado». Un barrio Paso Ancho en la ciudad es CIUDAD.
3) El campo de ciudad a veces dice solo «Panamá» (la provincia). Lee la dirección completa: si habla de La Chorrera, Arraiján, Colón, Chepo, Chitré, David u otro lugar del interior, es INTERIOR.
4) Nombres repetidos: Casa Blanca, La Loma, Balboa, Don Bosco, San Antonio, Las Américas, Amador, Miraflores, La Alameda, Llano Bonito, Pedregal (el de David) y Brisas del Golf (el de Arraiján) también existen en el interior. «Casa blanca» suele ser el color. Decide por la ciudad y el resto de la dirección.
5) Recoger en una oficina Servientrega (CDS): INTERIOR.
6) Lugares en discusión (Pan de Azúcar, Cerro Batea, Samaria, Cabima, Gonzalillo, Ciudad del Saber, Caimitillo, Ernesto Córdoba Campos, Cabra, Panamá Norte y los de las zonas 5 y 6): sigue la tendencia de la tienda. En Pacora, los sectores lejanos (Cabra, Santa Isabel, San Martín de Pacora) suelen ser INTERIOR. Si la tendencia es mixta o no hay datos y la dirección no aclara, «no_se»: lo revisan los asesores.
7) Completa: lugar y punto exacto (calle y casa, edificio y apartamento, o referencia clara). Incompleta: solo barrio o ciudad, o un nombre suelto. En «falta» pide solo lo que falta, por ejemplo «el número de casa o una referencia».'
where c.pais_id = (select id from paises where codigo = 'PA')
  and c.instrucciones = 'REGLAS DE ZONA DE PANAMÁ (confirmadas por el equipo):
1) CIUDAD = las 6 zonas de delivery de la geografía y todo lo que queda dentro de la línea roja del mapa del equipo: desde Amador, Naos, Flamenco, Perico, Albrook y el centro hasta San Miguelito, Alcalde Díaz, Las Cumbres, Tocumen y Pacora. Todo lo que queda fuera de la línea es INTERIOR/Servientrega: todo Panamá Oeste (otro lado del Canal, Cocolí), Colón, Chepo, Chilibre, Panamá Norte, Pradera de San Lorenzo, Utivé y las provincias.
2) Orden: primero las palabras de zona del equipo; luego la TENDENCIA HISTÓRICA clara de la tienda (en las zonas 5 y 6 Kenku suele INTERIOR; Nuvo y Oferfy, CIUDAD); si la tendencia es mixta o no hay, manda el reglamento: delivery y mapa = CIUDAD, fuera = INTERIOR.
3) Pago por adelantado: Bocas del Toro, Changuinola, Puerto Armuelles, Darién, Bajo Boquete, El Empalme, Portobelo, María Chiquita y Paso Ancho de Chiriquí: responde «adelantado». Un barrio Paso Ancho en la ciudad es CIUDAD.
4) El campo de ciudad a veces dice solo «Panamá» (la provincia). Lee la dirección completa: si habla de La Chorrera, Arraiján, Colón, Chepo, Chitré, David u otro lugar del interior, es INTERIOR.
5) Nombres repetidos: Casa Blanca, La Loma, Balboa, Don Bosco, San Antonio, Las Américas, Amador, Miraflores, La Alameda, Llano Bonito, Pedregal (el de David) y Brisas del Golf (el de Arraiján) también existen en el interior. «Casa blanca» suele ser el color. Decide por la ciudad y el resto de la dirección.
6) Recoger en una oficina Servientrega (CDS): INTERIOR.
7) Ernesto Córdoba Campos y Cabra no se ven en el mapa: sin tendencia ni otra pista, «no_se». En Pacora, los sectores lejanos (Cabra, Santa Isabel, San Martín de Pacora) suelen ser INTERIOR.
8) Completa: lugar y punto exacto (calle y casa, edificio y apartamento, o referencia clara). Incompleta: solo barrio o ciudad, o un nombre suelto. En «falta» pide solo lo que falta, por ejemplo «el número de casa o una referencia».';
delete from confirmacion_ia_zonas z using paises p
where z.pais_id = p.id and p.codigo = 'PA' and z.creado_por_nombre = 'Sistema'
  and z.clave in ('isla naos', 'isla flamenco', 'isla perico', 'calzada de amador', 'pradera de san lorenzo', 'el carano', 'utive', 'boca de pacora', 'cocoli');
delete from confirmacion_ia_ejemplos e using paises p
where e.pais_id = p.id and p.codigo = 'PA' and e.creado_por_nombre = 'Sistema' and e.tienda_id is null
  and e.direccion in ('Calzada de Amador, Isla Flamenco, local 12, frente al Biomuseo', 'Comunidad Pradera de San Lorenzo, casa 9, junto a la capilla');
notify pgrst, 'reload schema';
