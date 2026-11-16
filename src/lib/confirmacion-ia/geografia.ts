// Confirmación con IA: lo que la IA sabe de la geografía de cada país antes de leer una dirección (16 nov 2026, pedido de Hernán: «que tengas más o menos la geografía para saber cuál es ciudad y
// cuál es lo demás»). Es solo referencia: las palabras de zona que agrega el equipo mandan sobre esto, y lo que de verdad es dudoso se deja como «no sé» para que el equipo lo defina. Lógica pura, con su prueba.

/** Los corregimientos del distrito de Panamá según la lista consultada (24; el listado oficial habla de 26, así que puede faltar alguno: por eso es solo referencia). */
const CORREGIMIENTOS_DISTRITO_PANAMA = [
  "24 de Diciembre",
  "Alcalde Díaz",
  "Ancón",
  "Bella Vista",
  "Betania",
  "Caimitillo",
  "Calidonia",
  "Chilibre",
  "Curundú",
  "El Chorrillo",
  "Ernesto Córdoba Campos",
  "Juan Díaz",
  "Las Cumbres",
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

/** El corazón de la ciudad de Panamá: corregimientos y barrios que casi seguro son CIUDAD. */
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

/** Lo que depende de cómo lo clasifique el equipo: la IA no lo decide sola. */
const DUDOSAS = ["San Miguelito y sus corregimientos", "Tocumen", "24 de Diciembre", "Las Mañanitas", "Pacora", "San Martín", "Chilibre", "Alcalde Díaz", "Caimitillo", "Las Cumbres", "Ernesto Córdoba Campos"];

/** La geografía de Panamá como texto para el pedido a la IA. */
export function geografiaDePanama(): string {
  return [
    "GEOGRAFÍA DE PANAMÁ (solo como referencia; las palabras de zona del equipo mandan sobre esto):",
    "- Provincias: Panamá, Panamá Oeste, Colón, Chiriquí, Veraguas, Coclé, Herrera, Los Santos, Darién y Bocas del Toro; y las comarcas Guna Yala, Emberá-Wounaan y Ngäbe-Buglé. Fuera de la ciudad de Panamá todo es INTERIOR.",
    "- Provincia de Panamá Oeste (distritos Arraiján, La Chorrera, Capira, Chame y San Carlos; por ejemplo Burunga, Veracruz, Vista Alegre, Playa Leona, Coronado, Nueva Gorgona) es INTERIOR. «Panamá Oeste» y «Panamá Este» (hacia Chepo, Cañita, Chimán…) NO son ciudad.",
    "- Provincia de Colón (distritos Colón, Chagres, Donoso, Portobelo, Santa Isabel y Omar Torrijos Herrera; por ejemplo Cativá, Sabanitas, Puerto Pilón, Escobal) es INTERIOR.",
    `- La ciudad de Panamá es el distrito de Panamá (provincia de Panamá), con los corregimientos: ${CORREGIMIENTOS_DISTRITO_PANAMA.join(", ")}.`,
    `- El corazón de la ciudad, casi seguro CIUDAD: ${NUCLEO_URBANO.join(", ")}.`,
    `- Zonas dudosas, que dependen de cómo las clasifique el equipo: ${DUDOSAS.join(", ")}. Si no hay una palabra de zona que las defina, responde «no_se» en la zona (no adivines).`,
    "- Ojo: «Colón» también es un barrio, una calle o un corregimiento (Barrio Colón en La Chorrera); la que manda es la ciudad o el corregimiento que puso el cliente, leída junto con el resto de la dirección.",
  ].join("\n");
}

/** La geografía del país para el pedido a la IA; null si todavía no se tiene la de ese país. */
export function geografiaDe(codigoPais: string): string | null {
  return codigoPais.toUpperCase() === "PA" ? geografiaDePanama() : null;
}
