// Confirmación con IA › tendencia histórica de las tiendas (18 nov 2026, pedido de Jhokser; **Kenku se quitó el 24 nov 2026**: etiquetaba INTERIOR lugares que según el documento de delivery y el mapa son CIUDAD, y la IA no debe repetir eso; la IA sigue a los documentos y a lo que etiqueta la mayoría, que hoy son Nuvo y Oferfy): en las zonas donde el documento de delivery y la lista de Servientrega no coinciden (zonas 5 y 6 y los lugares en
// discusión), la IA etiqueta como lo viene haciendo la tienda. Sale de contar, en los pedidos del 19 oct al 18 nov 2026, qué etiqueta de zona recibió cada lugar. Los números se actualizan cuando se analicen más
// pedidos históricos. Lógica pura, con su prueba.

import { normalizarTexto } from "./zonas";

export interface LugarTendencia {
  lugar: string;
  ciudad: number;
  interior: number;
}

export interface TendenciaTienda {
  /** Palabra que identifica a la tienda en su nombre (sin acentos, en minúsculas). */
  clave: string;
  nombre: string;
  periodo: string;
  lugares: LugarTendencia[];
  /** Algo más que se sabe de esa tienda. */
  nota?: string;
}

/** Desde qué parte de los casos se considera que una tienda «tiene una tendencia» en un lugar. */
export const UMBRAL_TENDENCIA = 0.7;
/** Con menos casos que estos no se dice nada del lugar. */
export const MIN_CASOS_TENDENCIA = 2;

const PERIODO = "pedidos del 19 oct al 18 nov 2026";

export const TENDENCIAS_PANAMA: TendenciaTienda[] = [
  {
    clave: "oferfy",
    nombre: "Oferfy",
    periodo: PERIODO,
    lugares: [
      { lugar: "24 de Diciembre", ciudad: 33, interior: 2 },
      { lugar: "Alcalde Díaz", ciudad: 9, interior: 3 },
      { lugar: "Cabima", ciudad: 7, interior: 0 },
      { lugar: "La Cabima", ciudad: 5, interior: 0 },
      { lugar: "Caimitillo", ciudad: 8, interior: 0 },
      { lugar: "Cabra", ciudad: 5, interior: 1 },
      { lugar: "Cerro Batea", ciudad: 2, interior: 0 },
      { lugar: "Chivo Chivo", ciudad: 4, interior: 0 },
      { lugar: "Ciudad del Saber", ciudad: 0, interior: 2 },
      { lugar: "Ernesto Córdoba Campos", ciudad: 13, interior: 3 },
      { lugar: "Gonzalillo", ciudad: 2, interior: 0 },
      { lugar: "La Siesta", ciudad: 7, interior: 0 },
      { lugar: "Las Cumbres", ciudad: 17, interior: 6 },
      { lugar: "Mañanitas", ciudad: 15, interior: 3 },
      { lugar: "Milla 8", ciudad: 2, interior: 0 },
      { lugar: "Nuevo Tocumen", ciudad: 15, interior: 0 },
      { lugar: "Pacora", ciudad: 15, interior: 5 },
      { lugar: "Pan de Azúcar", ciudad: 2, interior: 1 },
      { lugar: "Panamá Norte", ciudad: 2, interior: 3 },
      { lugar: "Paraíso", ciudad: 9, interior: 2 },
      { lugar: "Pedregal", ciudad: 21, interior: 5 },
      { lugar: "Rana de Oro", ciudad: 5, interior: 0 },
      { lugar: "Samaria", ciudad: 5, interior: 0 },
      { lugar: "San Joaquín", ciudad: 2, interior: 0 },
      { lugar: "Tocumen", ciudad: 47, interior: 2 },
      { lugar: "Veranillo", ciudad: 6, interior: 2 },
      { lugar: "Villa Zaita", ciudad: 12, interior: 3 },
    ],
  },
  {
    clave: "nuvo",
    nombre: "Nuvo",
    periodo: PERIODO,
    lugares: [
      { lugar: "24 de Diciembre", ciudad: 12, interior: 1 },
      { lugar: "Alcalde Díaz", ciudad: 7, interior: 0 },
      { lugar: "Cabra", ciudad: 1, interior: 1 },
      { lugar: "Caimitillo", ciudad: 2, interior: 1 },
      { lugar: "Las Cumbres", ciudad: 8, interior: 1 },
      { lugar: "Mañanitas", ciudad: 5, interior: 3 },
      { lugar: "Milla 8", ciudad: 2, interior: 0 },
      { lugar: "Nuevo Tocumen", ciudad: 3, interior: 0 },
      { lugar: "Pacora", ciudad: 6, interior: 3 },
      { lugar: "Paraíso", ciudad: 3, interior: 0 },
      { lugar: "Pedregal", ciudad: 11, interior: 1 },
      { lugar: "Rana de Oro", ciudad: 2, interior: 0 },
      { lugar: "Samaria", ciudad: 2, interior: 0 },
      { lugar: "San Joaquín", ciudad: 2, interior: 0 },
      { lugar: "Tocumen", ciudad: 14, interior: 0 },
      { lugar: "Veranillo", ciudad: 2, interior: 0 },
      { lugar: "Villa Zaita", ciudad: 5, interior: 0 },
    ],
  },
];

export type DireccionTendencia = "ciudad" | "interior" | "mixto";

/** Hacia dónde tira un lugar en una tienda: la etiqueta que lleva al menos el 70 % de los casos, o «mixto». */
export function direccionDeLugar(l: LugarTendencia): DireccionTendencia {
  const n = l.ciudad + l.interior;
  if (n < MIN_CASOS_TENDENCIA) return "mixto";
  if (l.ciudad / n >= UMBRAL_TENDENCIA) return "ciudad";
  if (l.interior / n >= UMBRAL_TENDENCIA) return "interior";
  return "mixto";
}

/** La tendencia de la tienda cuyo nombre trae esa palabra («Kenku Panamá» → Kenku); null si no se tiene. */
export function tendenciaDeTienda(nombreTienda: string | null | undefined, tendencias: TendenciaTienda[] = TENDENCIAS_PANAMA): TendenciaTienda | null {
  const n = ` ${normalizarTexto(nombreTienda ?? "")} `;
  if (!n.trim()) return null;
  return tendencias.find((t) => n.includes(` ${t.clave} `)) ?? null;
}

const ETIQUETA: Record<DireccionTendencia, string> = { ciudad: "CIUDAD", interior: "INTERIOR", mixto: "mixto" };

/** El texto que se le agrega al pedido a la IA con la tendencia de esa tienda. */
export function textoTendencia(t: TendenciaTienda): string {
  const lugares = t.lugares.filter((l) => l.ciudad + l.interior >= MIN_CASOS_TENDENCIA).map((l) => `${l.lugar} → ${ETIQUETA[direccionDeLugar(l)]} (${l.ciudad} ciudad / ${l.interior} interior)`);
  return [
    `TENDENCIA HISTÓRICA DE ${t.nombre.toUpperCase()} (${t.periodo}). Para los lugares de las zonas 5 y 6 y los que están en discusión, así los etiquetó esta tienda (una tendencia clara manda sobre el reglamento):`,
    lugares.join("; ") + ".",
    ...(t.nota ? [t.nota] : []),
    "Para esos lugares sigue la tendencia de esta tienda, salvo que otro dato de la dirección diga lo contrario (otro lugar del interior, el distrito o la provincia, un barrio con el mismo nombre de otra ciudad, recoger en Servientrega). Si el lugar sale «mixto» o no está en la lista, manda el reglamento: las zonas de delivery y lo de dentro del mapa son CIUDAD y lo de fuera es INTERIOR; responde «no_se» solo si no se puede ubicar el lugar.",
  ].join("\n");
}
