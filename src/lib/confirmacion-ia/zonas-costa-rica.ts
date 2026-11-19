// Confirmación con IA › Costa Rica (19 nov 2026, pedido de Jhokser): qué lugares del país son CIUDAD (la Gran Área Metropolitana, etiqueta «CIUDAD-GAM») y cuáles INTERIOR («INTERIOR-ZONAS-ALEJADAS»).
// Sale del Excel «Codificación - Cantón - Provincia - Distrito - Barrio» del equipo: lo que está en verde es ciudad; lo azul y lo blanco, interior. La transportadora (Drop) es la misma para las dos: lo único
// que cambia es la etiqueta. El color del Excel es siempre por distrito (un solo distrito, SAN JOSÉ de Alajuela, trae un barrio aparte). Lógica pura, con su prueba.

import { normalizarTexto } from "./zonas";

/** Las provincias con sus cantones (los del Excel más Río Cuarto, Monteverde y Puerto Jiménez, que son más nuevos; los tres son interior). Un nombre de cantón no se repite entre provincias. */
export const CANTONES_COSTA_RICA: Record<string, string[]> = {
  "San José": ["San José", "Escazú", "Desamparados", "Puriscal", "Tarrazú", "Aserrí", "Mora", "Goicoechea", "Santa Ana", "Alajuelita", "Vásquez de Coronado", "Acosta", "Tibás", "Moravia", "Montes de Oca", "Turrubares", "Dota", "Curridabat", "Pérez Zeledón", "León Cortés Castro"],
  Alajuela: ["Alajuela", "San Ramón", "Grecia", "San Mateo", "Atenas", "Naranjo", "Palmares", "Poás", "Orotina", "San Carlos", "Zarcero", "Valverde Vega", "Upala", "Los Chiles", "Guatuso", "Río Cuarto"],
  Cartago: ["Cartago", "Paraíso", "La Unión", "Jiménez", "Turrialba", "Alvarado", "Oreamuno", "El Guarco"],
  Heredia: ["Heredia", "Barva", "Santo Domingo", "Santa Bárbara", "San Rafael", "San Isidro", "Belén", "Flores", "San Pablo", "Sarapiquí"],
  Guanacaste: ["Liberia", "Nicoya", "Santa Cruz", "Bagaces", "Carrillo", "Cañas", "Abangares", "Tilarán", "Nandayure", "La Cruz", "Hojancha"],
  Puntarenas: ["Puntarenas", "Esparza", "Buenos Aires", "Montes de Oro", "Osa", "Aguirre", "Golfito", "Coto Brus", "Parrita", "Corredores", "Garabito", "Monteverde", "Puerto Jiménez"],
  Limón: ["Limón", "Pococí", "Siquirres", "Talamanca", "Matina", "Guácimo"],
};

/** Los cantones de la provincia de San José donde **todos** los distritos son ciudad. */
export const CANTONES_DE_CIUDAD_COSTA_RICA = ["San José", "Escazú", "Desamparados", "Goicoechea", "Santa Ana", "Alajuelita", "Vásquez de Coronado", "Tibás", "Moravia", "Montes de Oca", "Curridabat"];

/** El cantón de Alajuela, que se reparte por distrito: estos son ciudad y los demás (San Isidro, Sabanilla, San Rafael y Sarapiquí) interior. */
export const DISTRITOS_DE_CIUDAD_ALAJUELA = ["Alajuela", "San José", "Carrizal", "San Antonio", "Guácima", "Río Segundo", "Desamparados", "Tambor", "Garita", "Turrúcares"];
/** El único barrio que el Excel marca como interior dentro de un distrito de ciudad (SAN JOSÉ de Alajuela). */
export const BARRIO_INTERIOR_EN_SAN_JOSE_DE_ALAJUELA = "Santa Rita";

const iguales = (a: string, b: string) => normalizarTexto(a) === normalizarTexto(b);
const estaEn = (lista: string[], x: string) => lista.some((y) => iguales(y, x));

/** Si el cantón es de alguna provincia del país (se reconoce sin acentos ni mayúsculas). */
export const esCantonDeCostaRica = (canton: string): boolean => Object.values(CANTONES_COSTA_RICA).some((l) => estaEn(l, canton));

/**
 * La zona de un lugar de Costa Rica por su cantón y su distrito: «ciudad» (CIUDAD-GAM) o «interior» (INTERIOR-ZONAS-ALEJADAS). Null si el cantón no se reconoce o, en el cantón de Alajuela, falta el distrito
 * (ahí depende de él). Con el barrio «Santa Rita» del distrito San José de Alajuela, interior.
 */
export function zonaDeCostaRica(l: { canton: string; distrito?: string | null; barrio?: string | null }): "ciudad" | "interior" | null {
  if (!l.canton || !esCantonDeCostaRica(l.canton)) return null;
  if (estaEn(CANTONES_DE_CIUDAD_COSTA_RICA, l.canton)) return "ciudad";
  if (!iguales(l.canton, "Alajuela")) return "interior";
  if (!l.distrito) return null;
  if (!estaEn(DISTRITOS_DE_CIUDAD_ALAJUELA, l.distrito)) return "interior";
  if (iguales(l.distrito, "San José") && l.barrio && iguales(l.barrio, BARRIO_INTERIOR_EN_SAN_JOSE_DE_ALAJUELA)) return "interior";
  return "ciudad";
}

/** La geografía de Costa Rica como texto para el pedido a la IA. */
export function geografiaDeCostaRica(): string {
  return [
    "GEOGRAFÍA DE COSTA RICA (solo como referencia; las palabras de zona del equipo mandan sobre esto):",
    "- Una dirección de Costa Rica se lee como provincia, cantón y distrito (y a veces barrio). La zona depende del CANTÓN y del distrito juntos, no de un nombre suelto: muchos nombres se repiten en distintos cantones (San Antonio, San Rafael, San Isidro, Santa Ana, Desamparados, San José…). Y «San José» como provincia no basta: hay cantones de San José que son interior.",
    ...Object.entries(CANTONES_COSTA_RICA).map(([provincia, cantones]) => `- Provincia de ${provincia}, cantones: ${cantones.join(", ")}.`),
    `- CIUDAD (etiqueta CIUDAD-GAM, la Gran Área Metropolitana) es SOLO esto: los 11 cantones de la provincia de San José ${CANTONES_DE_CIUDAD_COSTA_RICA.join(", ")}, en todos sus distritos; y, en el cantón de Alajuela, los distritos ${DISTRITOS_DE_CIUDAD_ALAJUELA.join(", ")} (en el distrito San José de Alajuela, el barrio ${BARRIO_INTERIOR_EN_SAN_JOSE_DE_ALAJUELA} es interior).`,
    "- Todo lo demás es INTERIOR (etiqueta INTERIOR-ZONAS-ALEJADAS): el resto de la provincia de San José (Puriscal, Tarrazú, Aserrí, Mora, Acosta, Turrubares, Dota, Pérez Zeledón y León Cortés Castro), los demás distritos del cantón de Alajuela (San Isidro, Sabanilla, San Rafael y Sarapiquí), todos los otros cantones de Alajuela, y todos los de Cartago, Heredia, Guanacaste, Puntarenas y Limón.",
    "- Las dos zonas se envían con la misma transportadora: lo único que cambia es la etiqueta. En Costa Rica no hay zonas de pago por adelantado: nunca respondas «adelantado».",
    "- Ojo con los nombres repetidos: «San Rafael» es ciudad en Escazú pero interior en el cantón de Alajuela (distrito San Rafael) y en Heredia; «San Antonio» es ciudad en Escazú, Desamparados y el cantón de Alajuela, pero interior en Belén (Heredia); «San Isidro» es ciudad en Vásquez de Coronado pero interior en el cantón de Alajuela, en Heredia y en Pérez Zeledón (San Isidro de El General); «Desamparados» y «Santa Ana» son ciudad. Decide siempre con el cantón y la provincia que dice la dirección.",
    "- Si dan solo la provincia, o el cantón de Alajuela sin su distrito, y no se puede saber el cantón o el distrito, responde «no_se» en la zona (no adivines): sin cantón no hay zona segura.",
  ].join("\n");
}
