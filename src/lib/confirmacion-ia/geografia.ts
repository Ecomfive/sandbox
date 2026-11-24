// Confirmación con IA: lo que la IA sabe de la geografía de cada país antes de leer una dirección (16 nov 2026, pedido de Hernán: «que tengas más o menos la geografía para saber cuál es ciudad y
// cuál es lo demás»). Es solo referencia: las palabras de zona que agrega el equipo mandan sobre esto, y lo que de verdad es dudoso se deja como «no sé» para que el equipo lo defina. Lógica pura, con su prueba.

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

/** El corazón de la ciudad de Panamá: los 13 corregimientos urbanos según Wikipedia (San Felipe a Pedregal), Ancón (Albrook, Clayton) y barrios conocidos; casi seguro CIUDAD. */
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
 * Las 6 zonas con reparto propio («delivery») de la ciudad de Panamá, tal cual las pasó el equipo en el documento «Zonas de envío con Delivery» (18 nov 2026). Todo lo que sale aquí es CIUDAD, salvo lo que
 * está en `ZONAS_EN_DISCUSION`. Es referencia para la IA: las palabras de zona del equipo mandan sobre esto.
 */
export const ZONAS_DELIVERY_PANAMA: { zona: number; nombre: string; lugares: string[] }[] = [
  {
    zona: 1,
    nombre: "Juan Díaz",
    lugares: ["Chanis", "Campo Lindbergh", "Anayansi", "San Fernando", "Ciudad Radial", "Plaza Costa Sur", "Costa del Este", "Anasa", "Don Bosco", "Versalles", "Reparto Nuevo Panamá", "Casa Blanca", "Altos del Romeral", "Santa Clara", "Marcasa", "El Sitio", "Llano Bonito", "Balán", "Las Acacias", "Los Caobos"],
  },
  {
    zona: 2,
    nombre: "Lucre / Brisas / San Antonio",
    lugares: ["Villa Lucre", "Paseo del Valle", "Altos de la Pulida", "Tierra Alta", "Florencia", "Las Trancas", "Quintas de Monticello", "Lomas del Golf", "Brisas del Pacífico", "Brisas del Golf", "Altamira", "Terrazas de Brisas del Golf", "Camino Real", "San Antonio", "Colinas de Cerro Viento", "La Riviera", "Villalobos", "Altos de Villalobos", "Montería", "Los Nogales", "Parque Real", "Las Américas", "Villas del Bosque", "Brisas Norte", "P.H. Alpes"],
  },
  {
    zona: 3,
    nombre: "San Miguelito / Altos de Panamá / Dorado / Betania / Edison",
    lugares: ["San Miguelito", "Calle Ojo de Agua", "Samaria", "Cerro la Cruz", "Cerro Batea", "9 de Enero", "Residencial El Bosque", "El Doral", "Linda Vista", "Limajo", "Barrio Alto", "Altos de Panamá", "Altos de Santa María", "Condado del Rey", "Dorado Springs", "Dorado Lakes", "Paseo Dorado", "Las Huacas", "Altamira Gardens", "Villa Cáceres", "Miraflores", "Club X", "El Ingenio", "AltaPlaza Mall", "Universidad Tecnológica", "Torres de Milán", "Bethania", "El Dorado", "La Locería", "La Alameda", "Dos Mares", "Edison Park", "Las Mercedes", "Camino de Cruces"],
  },
  {
    zona: 4,
    nombre: "Centro de la ciudad y Ancón",
    lugares: ["Los Yoses", "Victoriano Lorenzo", "Carmen Cecilia", "Puente del Rey", "Panamá Viejo", "12 de Octubre", "Hato Pintado", "Río Abajo", "Altos del Golf", "Coco del Mar", "Parque Lefevre", "Avenida Santa Elena", "La Loma", "Carrasquilla", "El Carmen", "San Francisco", "Punta Paitilla", "Punta Pacífica", "El Cangrejo", "Obarrio", "Estación Fernández de Córdoba", "La Cresta", "Calidonia", "Bella Vista", "La Exposición", "Altos de Curundú", "Curundú", "Perejil", "San Miguel", "Ancón", "Albrook", "Diablo", "Balboa", "Ciudad del Saber", "Corozal", "Cárdenas", "Clayton", "Casco Antiguo", "El Chorrillo", "Isla Flamenco", "Isla Naos", "Isla Perico", "Amador", "La Boca"],
  },
  {
    zona: 5,
    nombre: "Norte: Veranillo, Las Cumbres, Alcalde Díaz",
    lugares: ["San Miguelito", "Paraíso", "Veranillo", "Villa Zaita", "Nuevo Veranillo", "Cerro Batea", "San Isidro", "Pan de Azúcar", "Las Cumbres", "Ojo de Agua", "Milla 7 y 8", "Chivo Chivo", "San Librada", "Gonzalillo", "La Cabima", "Villa Grecia", "El Lago", "Alcalde Díaz"],
  },
  {
    zona: 6,
    nombre: "Este: Pedregal, Tocumen, 24 de Diciembre, Pacora",
    lugares: ["Pedregal", "Villalobos", "San Joaquín", "Rana de Oro", "Nogales", "Montería", "Mañanitas", "Tocumen Belén", "Las Américas", "La Siesta", "24 de Diciembre", "Tocumen", "Nuevo Tocumen", "La Doña", "Pacora"],
  },
];

/** Lugares de la provincia de Panamá que el equipo dice que van por Servientrega (INTERIOR) aunque estén cerca de la ciudad, y que no están en las zonas de delivery (lista que pasó el 18 nov 2026). */
export const LUGARES_SERVIENTREGA_PANAMA = ["Ciudad de la Salud", "Esclusas de Miraflores", "Chilibre", "Chepo", "Panamá Pacífico", "Vacamonte", "La Peña", "Monte Madero"];

/**
 * Lugares que salen a la vez como zona de delivery (CIUDAD) y en la lista de Servientrega (INTERIOR), más cuatro corregimientos que la lista de Servientrega nombra pero que las tiendas etiquetan casi siempre CIUDAD
 * (Ernesto Córdoba Campos, Caimitillo, Cabra, Panamá Norte). Las listas no coinciden y el equipo todavía no dijo cuál manda: la IA no los decide sola y responde «no_se» salvo que la dirección traiga otra pista (una
 * palabra de zona, otro lugar que sí defina la zona). Con los pedidos de octubre y noviembre de 2026 de Nuvo y Oferfy salen CIUDAD casi siempre (Kenku los mandaba a INTERIOR, pero eso se dejó de seguir el 24 nov 2026: sus asesores lo corrigen y la IA ya no usa su tendencia).
 */
export const ZONAS_EN_DISCUSION = ["Ernesto Córdoba Campos", "Cabra", "Las Cumbres", "Alcalde Díaz", "Ciudad del Saber", "Pan de Azúcar", "Cerro Batea", "Altos de la Pulida", "Samaria", "Tierra Alta", "Paraíso", "Cerro la Cruz", "La Cabima", "Gonzalillo", "Veranillo"];

/**
 * El mapa del equipo (23 nov 2026): una línea roja alrededor de la ciudad. Todo lo de adentro es CIUDAD (incluida la punta hacia el mar: Amador, Isla Naos, Isla Flamenco, Isla Perico) y todo lo de afuera es INTERIOR.
 * Con él se resuelven los lugares que están a la vez en el delivery y en la lista de Servientrega: los del delivery quedan adentro. Lo que el mapa deja afuera y no estaba en otra lista va aquí.
 */
export const LUGARES_FUERA_DEL_MAPA_PANAMA = ["Caimitillo", "Panamá Norte", "Pradera de San Lorenzo", "El Caraño", "Utivé", "Nuevo Sitio", "Los Lotes", "Paso Blanco", "Boca de Pacora", "Cocolí"];

/** Lo que el mapa deja dentro de la línea roja, para decírselo a la IA en palabras. */
const DENTRO_DEL_MAPA = "Amador, Isla Naos, Isla Flamenco, Isla Perico, Ancón, Albrook y el Casco Antiguo por el oeste (el límite es el Canal), todo el centro y San Miguelito, y por el norte Villa Zaita, Cerro Batea, Villa Grecia, La Cabima y Alcalde Díaz; por el este Tocumen, Nuevo Tocumen, Nueva Esperanza, Felipillo y Altos de Tatare hasta Pacora";

/** Zonas de difícil acceso o cerca de la frontera: se pagan por adelantado y el pedido no se etiqueta hasta que llegue el pago (lo gestiona el asesor). */
export const ZONAS_PAGO_ADELANTADO_PANAMA = ["Changuinola", "Bocas del Toro", "Isla Colón", "Puerto Armuelles", "Paso Ancho (el de Chiriquí)", "Bajo Boquete", "El Empalme", "Portobelo", "María Chiquita", "Darién"];

/** Lo que depende de cómo lo clasifique el equipo y no está en ninguna de las listas de arriba: la IA no lo decide sola. */
const DUDOSAS = ["Las Garzas (segregado de Pacora)", "San Martín"];

/** La geografía de Panamá como texto para el pedido a la IA. */
export function geografiaDePanama(): string {
  return [
    "GEOGRAFÍA DE PANAMÁ (solo como referencia; las palabras de zona del equipo mandan sobre esto):",
    "- Provincias: Panamá, Panamá Oeste, Colón, Chiriquí, Veraguas, Coclé, Herrera, Los Santos, Darién y Bocas del Toro; y las comarcas Guna Yala, Emberá-Wounaan y Ngäbe-Buglé. Fuera de la ciudad de Panamá todo es INTERIOR.",
    "- Provincia de Panamá Oeste (distritos Arraiján, La Chorrera, Capira, Chame y San Carlos; por ejemplo Burunga, Veracruz, Vista Alegre, Playa Leona, Coronado, Nueva Gorgona) es INTERIOR. «Panamá Oeste» y «Panamá Este» (hacia Chepo, Cañita, Chimán…) NO son ciudad.",
    "- Provincia de Colón (distritos Colón, Chagres, Donoso, Portobelo, Santa Isabel y Omar Torrijos Herrera; por ejemplo Cativá, Sabanitas, Puerto Pilón, Escobal) es INTERIOR.",
    `- La ciudad de Panamá es el distrito de Panamá (provincia de Panamá), con los corregimientos: ${CORREGIMIENTOS_DISTRITO_PANAMA.join(", ")}.`,
    `- El corazón de la ciudad, casi seguro CIUDAD: ${NUCLEO_URBANO.join(", ")}.`,
    "ZONAS CON REPARTO PROPIO (delivery) = CIUDAD. Son las 6 zonas que definió el equipo: todo lo que sale aquí es CIUDAD, aunque la dirección diga solo «Panamá» o el nombre del barrio. Las zonas 5 y 6 (Las Cumbres, Alcalde Díaz, Tocumen, Pacora…) también son CIUDAD por reglamento y por el mapa. La única excepción es una TENDENCIA HISTÓRICA clara de la tienda (se te da abajo, si existe): Kenku suele mandar esas zonas a INTERIOR y Nuvo y Oferfy a CIUDAD.",
    ...ZONAS_DELIVERY_PANAMA.map((z) => `  · Zona ${z.zona} (${z.nombre}): ${z.lugares.join(", ")}.`),
    `- MAPA DEL EQUIPO (una línea roja alrededor de la ciudad): todo lo que queda DENTRO es CIUDAD, incluida la punta hacia el mar; abarca ${DENTRO_DEL_MAPA}. Todo lo que queda FUERA de la línea es INTERIOR: ${LUGARES_FUERA_DEL_MAPA_PANAMA.join(", ")}, el otro lado del Canal (todo Panamá Oeste), Chepo, Colón y las provincias.`,
    "- ORDEN PARA DECIDIR LA ZONA: (1) una palabra de zona del equipo; (2) la tendencia clara de la tienda, si te la dan; (3) el reglamento: las zonas de delivery y lo de dentro del mapa son CIUDAD, lo de fuera es INTERIOR. Responde «no_se» solo si con eso no se puede ubicar el lugar.",
    `- Va por SERVIENTREGA (INTERIOR) aunque esté en la provincia de Panamá y cerca de la ciudad: ${LUGARES_SERVIENTREGA_PANAMA.join(", ")}; y todo Panamá Oeste, Colón, Chepo y las provincias del interior.`,
    `- Lugares donde las tiendas etiquetan distinto (estaban en el delivery y en la lista de Servientrega): ${ZONAS_EN_DISCUSION.join(", ")}. Los que son de las zonas de delivery y quedan dentro del mapa son CIUDAD por reglamento; si la tienda tiene una tendencia clara en ellos, sigue la tendencia. Ernesto Córdoba Campos y Cabra no se ven en el mapa: sin palabra de zona, tendencia ni otra pista en la dirección, responde «no_se» (no adivines).`,
    `- PAGO POR ADELANTADO (zonas de difícil acceso o cerca de la frontera; responde «adelantado» solo si el lugar es uno de estos): ${ZONAS_PAGO_ADELANTADO_PANAMA.join(", ")}. Un barrio llamado Paso Ancho dentro de la ciudad es CIUDAD.`,
    `- Zonas dudosas, que dependen de cómo las clasifique el equipo: ${DUDOSAS.join(", ")}. Si no hay una palabra de zona que las defina, responde «no_se» en la zona (no adivines).`,
    "- Ojo con los nombres repetidos (homónimos): muchos barrios de la ciudad se llaman igual que lugares del interior. Casa Blanca, La Loma, Balboa, Don Bosco, San Antonio, Las Américas, La Alameda, Miraflores, Amador, Llano Bonito o Pedregal (el de David, Chiriquí) también existen en La Chorrera, Arraiján, Colón, David, Santiago o Chitré, y «casa blanca» muchas veces es solo el color de la casa. Para decidir, lee la ciudad o el corregimiento que puso el cliente junto con el resto de la dirección (distrito, provincia, calles, referencias): si todo lo demás es del interior, es INTERIOR aunque el barrio se llame como uno de la ciudad.",
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
