// Confirmación con IA: cómo se llama y qué ejemplo lleva el campo de ciudad en cada país (19 nov 2026). En Panamá es la ciudad o el corregimiento; en Costa Rica lo que decide la zona es el cantón
// (con el distrito), y el ejemplo de dirección lleva provincia, cantón y distrito. Solo cambian los textos de las pantallas: lo que se guarda es el mismo campo `ciudad`. Lógica pura, con prueba.

export interface TextosCiudad {
  /** El nombre del campo, sin el asterisco. */
  campo: string;
  ejemploCiudad: string;
  ejemploDireccion: string;
}

const PANAMA: TextosCiudad = { campo: "Ciudad o corregimiento", ejemploCiudad: "Ej: Bella Vista, Colón, Arraiján", ejemploDireccion: "Ej: Urb. Los Pinos, calle 5, casa 12, frente a la tienda de la esquina" };
const COSTA_RICA: TextosCiudad = { campo: "Cantón o ciudad", ejemploCiudad: "Ej: Escazú, Alajuela, Heredia", ejemploDireccion: "Ej: Provincia San José, cantón Escazú, distrito San Rafael, 200 metros sur del parque, casa blanca con portón negro" };

export function textosCiudad(codigoPais: string | null | undefined): TextosCiudad {
  return String(codigoPais ?? "").toUpperCase() === "CR" ? COSTA_RICA : PANAMA;
}
