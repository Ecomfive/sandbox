// Buscar por imagen (pedido de Jhokser, 26 oct 2026): una foto pegada en el buscador de cualquier lista encuentra, en todo el sistema, los productos que
// se ven igual. Dos pasos, sin base ni red para poder probarlos:
//  1. Por **huella** de la foto (dHash de 64 bits, la misma de Producto y Scraping): encuentra la misma foto o una muy parecida (otro tamaño, otra compresión,
//     un recorte leve). Es gratis y rápida, pero no reconoce el mismo producto fotografiado distinto.
//  2. Por **nombre**: la IA dice qué producto es la foto («limpiador a vapor portátil») y de ahí salen candidatos por las palabras de su nombre; después la
//     IA compara la foto con las de los candidatos y dice cuáles son el mismo producto (`ia-imagen.ts`).

import { distanciaHuella, palabrasClave, parecidoNombre } from "@/lib/wms/duplicados";

/** Dónde se busca: cada uno es una parte del sistema que tiene productos con foto. */
export type Ambito = "producto" | "publicacion" | "scraping" | "competencia";

export const AMBITOS: { valor: Ambito; etiqueta: string; modulo: string }[] = [
  { valor: "producto", etiqueta: "Producto", modulo: "producto" },
  { valor: "publicacion", etiqueta: "Gestión de IDs Dropi", modulo: "publicaciones-dropi" },
  { valor: "scraping", etiqueta: "Scraping de proveedores", modulo: "scraping-proveedores" },
  { valor: "competencia", etiqueta: "Análisis de competencia", modulo: "analisis-competencia" },
];

export const etiquetaAmbito = (a: Ambito) => AMBITOS.find((x) => x.valor === a)?.etiqueta ?? a;

/** Algo con foto que se puede encontrar. */
export interface Candidato {
  ambito: Ambito;
  id: string;
  nombre: string;
  foto: string | null;
  /** La huella de su foto (16 cifras hexadecimales), si ya se calculó. */
  huella: string | null;
  /** Lo que ayuda a reconocerlo: «PUB-0306 · ID 8821», «SKU LIMPIADOR/VAPOR», «HYPER MODA · mx». */
  detalle: string;
  /** A dónde lleva en el sistema. */
  href: string;
}

export type NivelParecido = "misma" | "muy_parecida" | "se_parece";

/**
 * Hasta cuántos bits de diferencia se muestra una foto como parecida. Medido con las fotos reales: la misma foto achicada y recomprimida queda a 2-5 bits
 * (`UMBRAL_FOTO` de Producto); entre 6 y 10, casi siempre es el mismo producto con otro recorte o fondo; entre 11 y 18 hay que mirarla (también entran
 * frascos distintos sobre fondo blanco, por eso la IA los confirma).
 */
export const MAX_DISTANCIA = 18;

export function nivelDeDistancia(distancia: number): NivelParecido {
  return distancia <= 5 ? "misma" : distancia <= 10 ? "muy_parecida" : "se_parece";
}

export const ETIQUETA_NIVEL: Record<NivelParecido, string> = { misma: "Misma foto", muy_parecida: "Muy parecida", se_parece: "Se parece" };

export type Veredicto = "mismo" | "parecido" | "distinto";

export interface Coincidencia extends Candidato {
  /** Bits de diferencia entre las dos huellas; null si el candidato llegó solo por su nombre. */
  distancia: number | null;
  nivel: NivelParecido | null;
  /** Lo que dijo la IA al comparar las fotos; null si no se comparó. */
  veredicto: Veredicto | null;
  motivo: string | null;
  /** Qué tanto se parece su nombre a lo que dijo la IA (0 a 1); null si no llegó por el nombre. */
  afinidad: number | null;
}

/** Los candidatos cuya foto se parece a la buscada, de más a menos parecida, con un tope por ámbito (para que uno grande no tape a los demás). */
export function porHuella(huella: string, candidatos: Candidato[], opciones: { max?: number; limitePorAmbito?: number } = {}): Coincidencia[] {
  const { max = MAX_DISTANCIA, limitePorAmbito = 10 } = opciones;
  const cuenta = new Map<Ambito, number>();
  return candidatos
    .filter((c) => !!c.huella)
    .map((c) => ({ c, d: distanciaHuella(huella, c.huella as string) }))
    .filter((x) => x.d <= max)
    .sort((a, b) => a.d - b.d || a.c.nombre.localeCompare(b.c.nombre, "es"))
    .filter((x) => {
      const n = (cuenta.get(x.c.ambito) ?? 0) + 1;
      cuenta.set(x.c.ambito, n);
      return n <= limitePorAmbito;
    })
    .map(({ c, d }) => ({ ...c, distancia: d, nivel: nivelDeDistancia(d), veredicto: null, motivo: null, afinidad: null }));
}

/** Cuántas de las palabras buscadas aparecen en el nombre (dos palabras son iguales si una empieza por la otra y la corta tiene 4 letras o más). */
function palabrasEnComun(buscadas: string[], nombre: string[]): number {
  const igual = (x: string, y: string) => x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));
  return buscadas.filter((p) => nombre.some((q) => igual(p, q))).length;
}

/**
 * Los candidatos cuyo nombre se parece a las palabras que dijo la IA («limpiador vapor portátil»): para encontrar el mismo producto con otra foto.
 * Pide al menos la mitad de las palabras y, si la IA dio varias, al menos dos en común (una sola palabra suelta como «limpiador» traía «Cepillo limpiador»,
 * «Escoba de limpieza»…). Cuenta sobre las palabras buscadas: un nombre corto de una sola palabra ya no sale como «100 % parecido».
 */
export function porNombre(palabras: string[], candidatos: Candidato[], opciones: { limitePorAmbito?: number; minimo?: number } = {}): Coincidencia[] {
  const { limitePorAmbito = 6, minimo = 0.5 } = opciones;
  const buscadas = [...new Set(palabras.flatMap((p) => palabrasClave(p)))];
  if (!buscadas.length) return [];
  const piso = buscadas.length >= 2 ? 2 : 1;
  const cuenta = new Map<Ambito, number>();
  return candidatos
    .map((c) => {
      const propias = palabrasClave(c.nombre);
      return { c, p: parecidoNombre(buscadas, propias), comunes: palabrasEnComun(buscadas, propias) };
    })
    .filter((x) => x.p >= minimo && x.comunes >= piso && x.c.foto)
    .sort((a, b) => b.comunes - a.comunes || b.p - a.p || a.c.nombre.localeCompare(b.c.nombre, "es"))
    .filter((x) => {
      const n = (cuenta.get(x.c.ambito) ?? 0) + 1;
      cuenta.set(x.c.ambito, n);
      return n <= limitePorAmbito;
    })
    .map(({ c, comunes }) => ({ ...c, distancia: null, nivel: null, veredicto: null, motivo: null, afinidad: comunes / buscadas.length }));
}

/** Junta las coincidencias por huella y por nombre sin repetir (la de huella manda, trae su distancia). */
export function unirCoincidencias(...listas: Coincidencia[][]): Coincidencia[] {
  const vistos = new Map<string, Coincidencia>();
  for (const l of listas)
    for (const c of l) {
      const k = `${c.ambito}:${c.id}`;
      const previo = vistos.get(k);
      if (!previo) vistos.set(k, c);
      else if (previo.distancia === null && c.distancia !== null) vistos.set(k, { ...c, afinidad: c.afinidad ?? previo.afinidad });
      else if (previo.afinidad === null && c.afinidad !== null) vistos.set(k, { ...previo, afinidad: c.afinidad });
    }
  return [...vistos.values()];
}

/** Hasta dónde una foto por huella se considera lo bastante cerca como para mostrarse sin que la IA la haya confirmado. */
export const MAX_DISTANCIA_SIN_IA = 10;

/**
 * Cuáles se le muestran a la IA (pocos, porque más sube el costo y la confunde): primero las fotos casi iguales (huella ≤ 10 bits), después los que se llaman
 * parecido a lo que ella dijo (los de más palabras en común) y, si sobra lugar, las demás fotos por huella.
 */
export function elegirParaComparar(coincidencias: Coincidencia[], max: number): Coincidencia[] {
  const conFoto = coincidencias.filter((c) => !!c.foto);
  const cerca = conFoto.filter((c) => c.distancia !== null && c.distancia <= MAX_DISTANCIA_SIN_IA).sort((a, b) => (a.distancia as number) - (b.distancia as number));
  const nombre = conFoto.filter((c) => !cerca.includes(c) && c.afinidad !== null).sort((a, b) => (b.afinidad as number) - (a.afinidad as number) || (a.distancia ?? 99) - (b.distancia ?? 99));
  const resto = conFoto.filter((c) => !cerca.includes(c) && !nombre.includes(c)).sort((a, b) => (a.distancia ?? 99) - (b.distancia ?? 99));
  // Mitad y mitad si hay de las dos clases: ni la huella tapa al nombre ni al revés.
  const mitad = Math.ceil(max / 2);
  const elegidos = [...cerca.slice(0, nombre.length ? Math.max(mitad, max - nombre.length) : max), ...nombre.slice(0, Math.max(mitad, max - cerca.length))];
  return [...new Set([...elegidos, ...resto])].slice(0, max);
}

/**
 * Con la IA, la lista se limpia: lo que la IA dijo que es otro producto se quita (se cuenta aparte) y una foto que se parece solo de lejos y no se comparó no se
 * muestra. Sin IA, solo se quitan las muy lejanas.
 */
export function depurar(coincidencias: Coincidencia[], conIA: boolean): { visibles: Coincidencia[]; descartadas: number } {
  const visibles = coincidencias.filter((c) => {
    if (c.veredicto === "distinto") return false;
    if (conIA && !c.veredicto) return c.distancia !== null && c.distancia <= MAX_DISTANCIA_SIN_IA;
    return true;
  });
  return { visibles, descartadas: coincidencias.length - visibles.length };
}

const PESO_VEREDICTO: Record<Veredicto, number> = { mismo: 0, parecido: 1, distinto: 3 };

/**
 * El orden final: lo que la IA dijo que es el mismo producto primero, después lo parecido, al final lo que sin IA no se sabe y, hasta abajo, lo que la IA
 * descartó. Dentro de cada grupo, la foto más parecida primero.
 */
export function ordenar(coincidencias: Coincidencia[]): Coincidencia[] {
  const grupo = (c: Coincidencia) => (c.veredicto ? PESO_VEREDICTO[c.veredicto] : 2);
  return [...coincidencias].sort((a, b) => grupo(a) - grupo(b) || (a.distancia ?? 99) - (b.distancia ?? 99) || a.nombre.localeCompare(b.nombre, "es"));
}
