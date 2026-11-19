-- Confirmación con IA › tendencia de cada tienda (18 nov 2026, pedido de Jhokser). En las zonas 5 y 6 y en los lugares que salen a la vez en el delivery y en Servientrega, la IA etiqueta como lo viene haciendo cada tienda
-- (Kenku suele mandarlos a INTERIOR; Nuvo y Oferfy, a CIUDAD); si la tendencia es mixta y la dirección completa no aclara, «no_se» y lo revisan los asesores. Los números de cada tienda están en `tendencias.ts`.
--   * Cambia las instrucciones de la IA de Panamá solo si siguen siendo las que sembró la 0328.
--   * Quita el ejemplo general de Tocumen de la 0328 (Kenku y las otras tiendas lo etiquetan distinto) y deja un ejemplo de Tocumen por tienda.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0329_rollback.sql.

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
  and (c.instrucciones is null or c.instrucciones like 'REGLAS DE ZONA DE PANAMÁ (confirmadas por el equipo):%');

-- El ejemplo de Tocumen deja de ser general: cada tienda lo etiqueta a su manera.
delete from confirmacion_ia_ejemplos e using paises p
where e.pais_id = p.id and p.codigo = 'PA' and e.creado_por_nombre = 'Sistema' and e.tienda_id is null
  and e.direccion = 'Barriada La Siesta, calle Veraguas, casa 2735, portón verde' and e.ciudad = 'Tocumen';

insert into confirmacion_ia_ejemplos (pais_id, tienda_id, direccion, ciudad, completa, falta, zona, origen, creado_por_nombre)
select t.pais_id, t.id, v.direccion, v.ciudad, true, null, v.zona, 'manual', 'Sistema'
from tiendas t
join paises p on p.id = t.pais_id and p.codigo = 'PA'
join (values
  ('kenku', 'Barriada La Siesta, calle Veraguas, casa 2735, portón verde', 'Tocumen', 'interior'),
  ('kenku', 'Villa Zaita, Pradera del Rocío, casa C42, entrando por el Arrocha', 'Las Cumbres', 'interior'),
  ('oferfy', 'Barriada La Siesta, calle Veraguas, casa 2735, portón verde', 'Tocumen', 'ciudad'),
  ('oferfy', 'Villa Zaita, Pradera del Rocío, casa C42, entrando por el Arrocha', 'Las Cumbres', 'ciudad'),
  ('nuvo', 'Barriada La Siesta, calle Veraguas, casa 2735, portón verde', 'Tocumen', 'ciudad'),
  ('nuvo', 'Villa Zaita, Pradera del Rocío, casa C42, entrando por el Arrocha', 'Las Cumbres', 'ciudad')
) as v (tienda, direccion, ciudad, zona) on lower(t.nombre) like v.tienda || '%'
where not exists (select 1 from confirmacion_ia_ejemplos e where e.pais_id = t.pais_id and e.tienda_id = t.id and e.direccion = v.direccion and coalesce(e.ciudad, '') = v.ciudad);

notify pgrst, 'reload schema';
