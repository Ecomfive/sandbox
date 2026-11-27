// Confirmación con IA: lo que la IA sabe de la geografía de cada país antes de leer una dirección (16 nov 2026, pedido de Hernán: «que tengas más o menos la geografía para saber cuál es ciudad y
// cuál es lo demás»). Es solo referencia: las palabras de zona que agrega el equipo mandan sobre esto. Desde el 27 nov 2026 la ciudad son los 3 mapas de despacho y ya no hay tendencia por tienda. Lógica pura,
// con su prueba.

import { geografiaDeCostaRica } from "./zonas-costa-rica";

/**
 * Los 26 corregimientos del distrito de Panamá, verificados el 16 nov 2026 contra Wikipedia (distrito de Panamá: «veintiséis corregimientos») y las leyes que crearon los últimos: Las Garzas (Ley 40 de 2017,
 * segregado de Pacora) y Don Bosco (Ley 42 de 2017, segregado de Juan Díaz). La lista en inglés que se consultó primero tenía 24 porque no incluía esos dos.
 */
export const CORREGIMIENTOS_DISTRITO_PANAMA = [
  "24 de Diciembre",
  "Alcalde Díaz",
  "Ancón",
  "Bella Vista",
  "Betania",
  "Caimitillo",
  "Calidonia",
  "Chilibre",
  "Curundú",
  "Don Bosco",
  "El Chorrillo",
  "Ernesto Córdoba Campos",
  "Juan Díaz",
  "Las Cumbres",
  "Las Garzas",
  "Las Mañanitas",
  "Pacora",
  "Parque Lefevre",
  "Pedregal",
  "Pueblo Nuevo",
  "Río Abajo",
  "San Felipe",
  "San Francisco",
  "San Martín",
  "Santa Ana",
  "Tocumen",
];

/** El corazón de la ciudad de Panamá: los 13 corregimientos urbanos según Wikipedia (San Felipe a Pedregal), Ancón (Albrook, Clayton) y barrios conocidos; CIUDAD. */
const NUCLEO_URBANO = [
  "Bella Vista",
  "Betania",
  "Calidonia",
  "Curundú",
  "El Chorrillo",
  "Pueblo Nuevo",
  "Río Abajo",
  "San Felipe (Casco Viejo)",
  "San Francisco",
  "Santa Ana",
  "Parque Lefevre",
  "Juan Díaz",
  "Pedregal",
  "Ancón",
  "El Cangrejo",
  "Obarrio",
  "Marbella",
  "Paitilla",
  "Punta Pacífica",
  "Costa del Este",
  "Albrook",
  "Clayton",
  "Carrasquilla",
  "Vía España",
];

/**
 * Las 6 zonas con reparto propio («delivery») de la ciudad de Panamá, del documento «Zonas de envío con Delivery» (18 nov 2026), con lo que despacho marcó en sus 3 mapas (27 nov 2026): naranja = zonas
 * 1 a 4, rojo = zona 5 (norte) y morado = zona 6 (Tocumen a Pacora). Todo lo de adentro de los tres colores es CIUDAD; lo de afuera va por Servientrega (INTERIOR). Las zonas 5 y 6 son CIUDAD mientras haya
 * delivery propio: si un día falla el mensajero, despacho avisa antes y esos pedidos salen por Servientrega.
 */
export const ZONAS_DELIVERY_PANAMA: { zona: number; nombre: string; lugares: string[] }[] = [
  {
    zona: 1,
    nombre: "Juan Díaz",
    lugares: ["Chanis", "Campo Lindbergh", "Anayansi", "San Fernando", "Ciudad Radial", "Plaza Costa Sur", "Costa del Este", "Anasa", "Don Bosco", "Versalles", "Reparto Nuevo Panamá", "Casa Blanca", "Altos del Romeral", "Santa Clara", "Marcasa", "El Sitio", "Llano Bonito", "Balán", "Las Acacias", "Los Caobos", "Pedregal"],
  },
  {
    zona: 2,
    nombre: "Lucre / Brisas / San Antonio",
    lugares: ["Villa Lucre", "Paseo del Valle", "Altos de la Pulida", "Tierra Alta", "Florencia", "Las Trancas", "Quintas de Monticello", "Lomas del Golf", "Brisas del Pacífico", "Brisas del Golf", "Altamira", "Terrazas de Brisas del Golf", "Camino Real", "San Antonio", "Colinas de Cerro Viento", "La Riviera", "Villalobos", "Altos de Villalobos", "Montería", "Los Nogales", "Parque Real", "Las Américas", "Villas del Bosque", "Brisas Norte", "P.H. Alpes"],
  },
  {
    zona: 3,
    nombre: "San Miguelito / Altos de Panamá / Dorado / Betania / Edison",
    lugares: ["San Miguelito", "Calle Ojo de Agua", "Samaria", "Cerro la Cruz", "Cerro Batea", "9 de Enero", "Residencial El Bosque", "El Doral", "Linda Vista", "Limajo", "Barrio Alto", "Altos de Panamá", "Altos de Santa María", "Condado del Rey", "Dorado Springs", "Dorado Lakes", "Paseo Dorado", "Las Huacas", "Altamira Gardens", "Villa Cáceres", "Miraflores", "Club X", "El Ingenio", "AltaPlaza Mall", "Universidad Tecnológica", "Torres de Milán", "Bethania", "El Dorado", "La Locería", "La Alameda", "Dos Mares", "Edison Park", "Las Mercedes", "Camino de Cruces", "Torrijos Carter", "Los Andes"],
  },
  {
    zona: 4,
    nombre: "Centro de la ciudad y Ancón",
    lugares: ["Los Yoses", "Victoriano Lorenzo", "Carmen Cecilia", "Puente del Rey", "Panamá Viejo", "12 de Octubre", "Hato Pintado", "Río Abajo", "Altos del Golf", "Coco del Mar", "Parque Lefevre", "Avenida Santa Elena", "La Loma", "Carrasquilla", "El Carmen", "San Francisco", "Punta Paitilla", "Punta Pacífica", "El Cangrejo", "Obarrio", "Estación Fernández de Córdoba", "La Cresta", "Calidonia", "Bella Vista", "La Exposición", "Altos de Curundú", "Curundú", "Perejil", "San Miguel", "Ancón", "Albrook", "Diablo", "Balboa", "Ciudad del Saber", "Corozal", "Cárdenas", "Clayton", "Casco Antiguo", "El Chorrillo", "Isla Flamenco", "Isla Naos", "Isla Perico", "Amador", "La Boca"],
  },
  {
    zona: 5,
    nombre: "Norte (línea roja): Veranillo, Las Cumbres, Alcalde Díaz",
    lugares: ["Paraíso", "Veranillo", "Nuevo Veranillo", "Villa Zaita", "Santa Librada", "Ernesto Córdoba Campos", "San Isidro", "Pan de Azúcar", "Las Cumbres", "Villa Grecia", "El Peñón", "Colinas de Las Cumbres", "Valles del Lago", "Mirador del Lago", "Ciudad del Lago", "Ojo de Agua", "Milla 7 y 8", "Chivo Chivo", "Gonzalillo", "La Cabima", "El Lago", "Alcalde Díaz", "Ciudad Bolívar", "Quebrada Ancha", "La Laguna", "Urbanización El Amanecer", "Praderas de San Lorenzo"],
  },
  {
    zona: 6,
    nombre: "Este (morado): Mañanitas, Tocumen, 24 de Diciembre, Pacora",
    lugares: ["Las Mañanitas", "Los Nogales 2", "Barriada Las Américas", "Tocumen", "Tocumen Belén", "Altos de Tocumen", "Nuevo Tocumen", "La Siesta", "Aeropuerto de Tocumen", "24 de Diciembre", "Nueva Esperanza", "Felipillo", "Altos de Tatare", "La Doña", "Pacora", "Cabra", "Santa Isabel de Pacora", "Mirador del Bosque", "San Joaquín", "Rana de Oro"],
  },
];

/**
 * Lo que va por Servientrega (INTERIOR) aunque esté en la provincia de Panamá y cerca de la ciudad: queda fuera de los tres colores de los mapas de despacho (27 nov 2026) o está en la lista de Servientrega
 * del 18 nov 2026.
 */
export const LUGARES_SERVIENTREGA_PANAMA = [
  "Chilibre (San Vicente, Agua Buena, El Sitio de Chilibre, Villa Unida, Maden, Buenos Aires de Chilibre, Viento Frío)",
  "Caimitillo fuera de Praderas de San Lorenzo (Calzada Larga, San Bartolomé y el centro de Caimitillo)",
  "Cerro Azul",
  "Las Garzas (La Mireya, Pacora Garden, Hugo Spadafora, Montemadero, San Diego)",
  "San Martín de Pacora",
  "Brisas del Mirador, Los Lotes y Hacienda Country Club (al norte, pasando Pacora)",
  "Paso Blanco, Cachipa, Río Chico y todo lo que pasa el río Pacora",
  "Chepo, Cañita y Panamá Este",
  "Panamá Pacífico, Howard (River Valley, Woodland, Explora, Residencial Howard) y todo Panamá Oeste (Arraiján, Vacamonte, Burunga, La Chorrera…)",
  "Cocolí, Pedro Miguel y Gamboa",
  "Ciudad de la Salud y Esclusas de Miraflores",
  "El Caraño, Utivé y Nuevo Sitio",
];

/** Las dudas que se le hicieron al equipo y lo que respondió despacho con sus mapas (27 nov 2026). Ya no hay zonas «en discusión» ni tendencia por tienda: manda el mapa. */
export const DUDAS_RESUELTAS_PANAMA: { lugar: string; respuesta: string }[] = [
  {
    lugar: "Pacora",
    respuesta:
      "CIUDAD el pueblo de Pacora y lo que queda sobre la Panamericana hasta el río Pacora (Cabra, Santa Isabel de Pacora, Mirador del Bosque). INTERIOR: Las Garzas, San Martín de Pacora, Brisas del Mirador, Los Lotes y lo que pasa el río",
  },
  { lugar: "Ernesto Córdoba Campos", respuesta: "CIUDAD todo (Villa Zaita, Santa Librada, Villa Campestre, Lagos del Norte, San Marino): queda dentro de la línea roja y la naranja" },
  { lugar: "Caimitillo / Praderas de San Lorenzo", respuesta: "Praderas de San Lorenzo y Urbanización El Amanecer son CIUDAD (dentro de la línea roja); el resto de Caimitillo es INTERIOR" },
  { lugar: "Chilibre", respuesta: "INTERIOR todo; el Los Caobos de Chilibre también es INTERIOR (el de Juan Díaz es CIUDAD)" },
  { lugar: "Panamá Pacífico / Howard", respuesta: "INTERIOR todo" },
  { lugar: "Panamá Norte (corregimiento)", respuesta: "Colinas de Las Cumbres, Ciudad del Lago, Valles del Lago y Mirador del Lago son CIUDAD; Chilibre y Caimitillo (salvo Praderas de San Lorenzo) son INTERIOR" },
  { lugar: "Las Garzas", respuesta: "INTERIOR (queda fuera del morado)" },
  { lugar: "San Martín", respuesta: "CIUDAD solo el de Samaria (San Miguelito); San Martín de Pacora, San Martín de Porres (Santiago) y el de Pocrí son INTERIOR" },
  { lugar: "Pedregal", respuesta: "CIUDAD, salvo que la ciudad o la dirección digan David o Chiriquí (Pedregal de David es INTERIOR)" },
  { lugar: "Mañanitas", respuesta: "CIUDAD todo, incluidos Los Nogales 2 y la Barriada Las Américas" },
  { lugar: "Alcalde Díaz", respuesta: "CIUDAD todo, incluidos Quebrada Ancha, la vereda Divino Niño y la zona del centro de salud" },
  { lugar: "Las Cumbres", respuesta: "CIUDAD todo, incluidos Villa Grecia, El Peñón, Las Lajas y Nueva Unión Veragüense" },
  { lugar: "Veranillo", respuesta: "CIUDAD aunque el cliente escriba Chilibre o Belisario Porras (San Cristóbal, Don Bosco Veranillo)" },
];

/** Zonas de difícil acceso o cerca de la frontera: se pagan por adelantado y el pedido no se etiqueta hasta que llegue el pago (lo gestiona el asesor). */
export const ZONAS_PAGO_ADELANTADO_PANAMA = ["Changuinola", "Bocas del Toro", "Isla Colón", "Puerto Armuelles", "Paso Ancho (el de Chiriquí)", "Bajo Boquete", "El Empalme", "Portobelo", "María Chiquita", "Darién"];

/** Nombres que confundieron en la prueba del 27 nov 2026 porque son de un lugar y de otro: se le dicen a la IA con su respuesta. */
export const NOMBRES_QUE_CONFUNDEN = [
  "«Estadio Santa Rita» o «calle Santa Rita» en Santa Ana: CIUDAD (no es Santa Rita de Pacora)",
  "«Calle 10 y Santa Isabel» o «Barrio Sur»: es la ciudad de Colón, INTERIOR (no es Santa Isabel de Pacora)",
  "«Nave Dolega» en Merca Panamá (Ancón): CIUDAD (no es Dolega de Chiriquí)",
  "«Colonia Las Lomas» en La Pulida (San Miguelito): CIUDAD; Las Lomas de La Chorrera o de David: INTERIOR",
  "«PH Arraiján» o un edificio con nombre de un lugar del interior dentro de Calidonia u otro barrio de la ciudad: es el nombre del edificio, CIUDAD",
  "«Plaza Las Américas», «La Riviera», «San Mateo» o «casa blanca» con la ciudad David: INTERIOR (son de David)",
  "«Cuipo», «Costa Abajo» o «El Guabo»: Colón, INTERIOR, aunque digan «Chorrillo»",
  "Recoger en una oficina de Servientrega («CDS Los Andes Mall», «CDS Mañanitas»): INTERIOR/Servientrega aunque la oficina esté en la ciudad",
];

/** La geografía de Panamá como texto para el pedido a la IA. */
export function geografiaDePanama(): string {
  return [
    "GEOGRAFÍA DE PANAMÁ (solo como referencia; las palabras de zona del equipo mandan sobre esto):",
    "- Provincias: Panamá, Panamá Oeste, Colón, Chiriquí, Veraguas, Coclé, Herrera, Los Santos, Darién y Bocas del Toro; y las comarcas Guna Yala, Emberá-Wounaan y Ngäbe-Buglé. Fuera de la ciudad de Panamá todo es INTERIOR.",
    "- Provincia de Panamá Oeste (distritos Arraiján, La Chorrera, Capira, Chame y San Carlos; por ejemplo Burunga, Veracruz, Vista Alegre, Playa Leona, Coronado, Nueva Gorgona) es INTERIOR. «Panamá Oeste» y «Panamá Este» (hacia Chepo, Cañita, Chimán…) NO son ciudad; pero hay clientes de 24 de Diciembre, Tocumen o Pacora que escriben «Panamá Este» como su ciudad: si la dirección dice uno de esos lugares, manda el lugar (CIUDAD).",
    "- Provincia de Colón (distritos Colón, Chagres, Donoso, Portobelo, Santa Isabel y Omar Torrijos Herrera; por ejemplo Cativá, Sabanitas, Puerto Pilón, Escobal) es INTERIOR.",
    `- La ciudad de Panamá es el distrito de Panamá (provincia de Panamá), con los corregimientos ${CORREGIMIENTOS_DISTRITO_PANAMA.join(", ")}, y el distrito de San Miguelito; de esos corregimientos, lo que queda fuera de los mapas de despacho va por Servientrega (abajo).`,
    `- El corazón de la ciudad, CIUDAD: ${NUCLEO_URBANO.join(", ")}.`,
    "- MAPAS DE DESPACHO (27 nov 2026): la ciudad son tres zonas pintadas. NARANJA (zonas 1 a 4): desde Amador, el Casco y Albrook (el límite es el Canal) por todo el centro, San Miguelito y Juan Díaz hasta Costa del Este, Las Acacias, Ciudad Radial y Villalobos. ROJO (zona 5): Villa Lucre, Cerro Batea, Torrijos Carter, Santa Librada y Villa Zaita hacia el norte por Las Cumbres, Villa Grecia, La Cabima y Alcalde Díaz hasta Praderas de San Lorenzo y Urbanización El Amanecer. MORADO (zona 6): Las Mañanitas, Tocumen y el aeropuerto, Nuevo Tocumen, Nueva Esperanza, Felipillo y Altos de Tatare hasta el pueblo de Pacora (el río Pacora es el límite). Todo lo de adentro de los tres colores es CIUDAD; todo lo de afuera va por Servientrega (INTERIOR).",
    "ZONAS CON REPARTO PROPIO (delivery) = CIUDAD, aunque la dirección diga solo «Panamá» o el nombre del barrio:",
    ...ZONAS_DELIVERY_PANAMA.map((z) => `  · Zona ${z.zona} (${z.nombre}): ${z.lugares.join(", ")}.`),
    "- ORDEN PARA DECIDIR LA ZONA: (1) una palabra de zona del equipo; (2) los mapas de despacho y las zonas de delivery: adentro es CIUDAD, afuera es INTERIOR. No hay tendencia por tienda: todas las tiendas se etiquetan igual; responde «no_se» solo si con eso no se puede ubicar el lugar.",
    `- Va por SERVIENTREGA (INTERIOR) aunque esté en la provincia de Panamá y cerca de la ciudad: ${LUGARES_SERVIENTREGA_PANAMA.join("; ")}; y todo Colón y las provincias del interior.`,
    `- Dudas ya resueltas por despacho: ${DUDAS_RESUELTAS_PANAMA.map((d) => `${d.lugar}: ${d.respuesta}`).join(". ")}.`,
    `- PAGO POR ADELANTADO (zonas de difícil acceso o cerca de la frontera; responde «adelantado» solo si el lugar es uno de estos): ${ZONAS_PAGO_ADELANTADO_PANAMA.join(", ")}. Un barrio llamado Paso Ancho dentro de la ciudad es CIUDAD.`,
    "- Ojo con los nombres repetidos (homónimos): muchos barrios de la ciudad se llaman igual que lugares del interior. Casa Blanca, La Loma, Balboa, Don Bosco, San Antonio, Las Américas, La Alameda, Miraflores, Amador, Llano Bonito, Los Caobos, San Martín, Santa Rita, Santa Isabel, Las Lomas o Pedregal (el de David, Chiriquí) también existen en La Chorrera, Arraiján, Colón, David, Santiago, Chitré o Pacora, y «casa blanca» muchas veces es solo el color de la casa. Para decidir, lee la ciudad o el corregimiento que puso el cliente junto con el resto de la dirección (distrito, provincia, calles, referencias): si todo lo demás es del interior, es INTERIOR aunque el barrio se llame como uno de la ciudad.",
    `- Casos que ya confundieron: ${NOMBRES_QUE_CONFUNDEN.join("; ")}.`,
    "- Si el cliente puso «Panamá» como ciudad pero la dirección habla de Chepo, La Chorrera, Arraiján, Colón, Chilibre, Panamá Pacífico (Howard), Chitré, Santiago, David u otro lugar del interior, es INTERIOR: «Panamá» es la provincia y manda lo que dice la dirección.",
    "- Si el cliente pide recoger el pedido en una oficina o centro de Servientrega (por ejemplo «CDS Mañanitas»), es INTERIOR/Servientrega aunque esa oficina esté en la ciudad.",
    "- Ojo: «Colón» también es un barrio, una calle o un corregimiento (Barrio Colón en La Chorrera); la que manda es la ciudad o el corregimiento que puso el cliente, leída junto con el resto de la dirección.",
  ].join("\n");
}

/** La geografía del país para el pedido a la IA; null si todavía no se tiene la de ese país. */
export function geografiaDe(codigoPais: string): string | null {
  const c = codigoPais.toUpperCase();
  if (c === "PA") return geografiaDePanama();
  if (c === "CR") return geografiaDeCostaRica();
  return null;
}
