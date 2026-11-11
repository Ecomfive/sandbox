// Parecido entre descripciones del libro y sugerencias por parecido con lo ya clasificado. Lógica pura (sin Supabase):
// la usan la bandeja «Por clasificar» (sugerencia con confianza), los duplicados y el catálogo de proveedores.
// Prueba en `similitud.test.ts`.

import { normalizar } from "./clasificacion";

/** Palabras que no distinguen un movimiento de otro. */
const VACIAS = new Set(["EN", "DE", "DEL", "LA", "EL", "LOS", "LAS", "A", "AL", "Y", "POR", "PARA", "CON", "SA", "S", "INC", "LLC", "CORP"]);

/** Las palabras que cuentan de una descripción: sin números (referencias, fechas), sin palabras vacías ni letras sueltas. */
export function palabras(descripcion: string): string[] {
  return normalizar(descripcion)
    .split(" ")
    .filter((p) => p.length >= 2 && !/\d/.test(p) && !VACIAS.has(p));
}

/** Trigramas de letras de un texto (con bordes), para comparar palabras mal escritas («FACEBK» y «FACEBOOK»). */
export function trigramas(texto: string): Set<string> {
  const t = ` ${texto} `;
  const salida = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) salida.add(t.slice(i, i + 3));
  return salida;
}

const interseccion = <T,>(a: Set<T>, b: Set<T>) => {
  let n = 0;
  const [chico, grande] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of chico) if (grande.has(x)) n++;
  return n;
};

/** Parecido de dos listas de palabras (0 a 1): lo mejor entre palabras en común (Jaccard) y letras en común (Dice). */
export function parecidoPalabras(a: string[], b: string[], triA?: Set<string>, triB?: Set<string>): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  const comunes = interseccion(sa, sb);
  const jaccard = comunes / (sa.size + sb.size - comunes);
  const ta = triA ?? trigramas(a.join(" "));
  const tb = triB ?? trigramas(b.join(" "));
  const dice = (2 * interseccion(ta, tb)) / (ta.size + tb.size);
  // Las letras en común pesan un poco menos: dos textos largos comparten trigramas sueltos sin ser lo mismo.
  return Math.max(jaccard, dice * 0.9);
}

/** Parecido de dos descripciones (0 a 1). */
export const similitud = (a: string, b: string) => parecidoPalabras(palabras(a), palabras(b));

/** Cuánto se parecen dos montos (1 = iguales; baja con la razón entre ellos, nunca menos de 0,35). */
export function parecidoMonto(a: number, b: number): number {
  const x = Math.abs(a);
  const y = Math.abs(b);
  if (!x || !y) return 0.35;
  return Math.max(0.35, Math.exp(-Math.abs(Math.log(x / y))));
}

export interface Historico {
  descripcion: string;
  monto: number;
  unidad_id: string;
  tipo_id: string;
}

interface Entrada {
  palabras: string[];
  tri: Set<string>;
  monto: number;
  unidad_id: string;
  tipo_id: string;
  descripcion: string;
}

export interface IndiceParecido {
  entradas: Entrada[];
  porPalabra: Map<string, number[]>;
  sinTienda: string | null;
}

/** Arma el índice de lo ya clasificado (por palabra, para no comparar cada pendiente contra todo el libro). */
export function indexar(historial: Historico[], sinTienda: string | null): IndiceParecido {
  const entradas: Entrada[] = [];
  const porPalabra = new Map<string, number[]>();
  for (const h of historial) {
    const p = palabras(h.descripcion);
    if (!p.length || !h.tipo_id) continue;
    const i = entradas.push({ palabras: p, tri: trigramas(p.join(" ")), monto: Number(h.monto) || 0, unidad_id: h.unidad_id, tipo_id: h.tipo_id, descripcion: h.descripcion }) - 1;
    for (const w of new Set(p)) {
      const l = porPalabra.get(w) ?? [];
      l.push(i);
      porPalabra.set(w, l);
    }
  }
  return { entradas, porPalabra, sinTienda };
}

export interface Voto {
  id: string;
  /** 0 a 100. */
  confianza: number;
  /** Cuántos movimientos parecidos lo apoyan. */
  apoyo: number;
}

export interface SugerenciaParecido {
  tipo: Voto | null;
  unidad: Voto | null;
  /** El parecido del movimiento más cercano (0 a 1) y su descripción, para explicar la sugerencia. */
  parecido: number;
  ejemplo: string | null;
}

/** Parecido mínimo para que un movimiento ya clasificado cuente como vecino. */
export const MIN_PARECIDO = 0.45;
/** Vecinos que votan. */
export const VECINOS = 12;
/** Una palabra que aparece en más movimientos que esto («COMPRA», «PAGO») no sirve para buscar vecinos. */
const PALABRA_COMUN = 1500;

/**
 * Sugiere tipo y tienda por parecido: busca los movimientos ya clasificados más parecidos (descripción y monto) y cada
 * uno vota por su tipo y su tienda con un peso de parecido² × parecido de monto. La confianza combina el acuerdo (qué
 * parte de los votos se lleva el ganador), la fuerza (cuántos votos hay) y el parecido del mejor vecino.
 */
export function sugerirPorParecido(mov: { descripcion: string; monto: number }, indice: IndiceParecido, vecinos = VECINOS): SugerenciaParecido {
  const vacia: SugerenciaParecido = { tipo: null, unidad: null, parecido: 0, ejemplo: null };
  const p = palabras(mov.descripcion);
  if (!p.length) return vacia;
  const tri = trigramas(p.join(" "));
  const candidatos = new Set<number>();
  const listas = [...new Set(p)].map((w) => indice.porPalabra.get(w) ?? []).filter((l) => l.length);
  const utiles = listas.filter((l) => l.length <= PALABRA_COMUN);
  for (const l of utiles.length ? utiles : listas.slice(0, 1)) for (const i of l) candidatos.add(i);
  const puntuados: { e: Entrada; sim: number; peso: number }[] = [];
  for (const i of candidatos) {
    const e = indice.entradas[i];
    const sim = parecidoPalabras(p, e.palabras, tri, e.tri);
    if (sim < MIN_PARECIDO) continue;
    puntuados.push({ e, sim, peso: sim * sim * parecidoMonto(mov.monto, e.monto) });
  }
  if (!puntuados.length) return vacia;
  puntuados.sort((a, b) => b.sim - a.sim || b.peso - a.peso);
  const top = puntuados.slice(0, vecinos);
  const votar = (campo: "tipo_id" | "unidad_id"): Voto | null => {
    const votos = new Map<string, { peso: number; apoyo: number; mejor: number }>();
    let total = 0;
    for (const { e, sim, peso } of top) {
      const id = e[campo];
      if (!id || (campo === "unidad_id" && id === indice.sinTienda)) continue;
      const v = votos.get(id) ?? { peso: 0, apoyo: 0, mejor: 0 };
      v.peso += peso;
      v.apoyo++;
      v.mejor = Math.max(v.mejor, sim);
      votos.set(id, v);
      total += peso;
    }
    if (!total) return null;
    const [id, v] = [...votos].sort((a, b) => b[1].peso - a[1].peso)[0];
    const acuerdo = v.peso / total;
    const fuerza = 1 - Math.exp(-v.peso / 1.2);
    // Nunca 100: eso queda para una regla escrita por una persona.
    const confianza = Math.min(95, Math.round(100 * acuerdo * fuerza * Math.sqrt(v.mejor)));
    return confianza > 0 ? { id, confianza, apoyo: v.apoyo } : null;
  };
  return { tipo: votar("tipo_id"), unidad: votar("unidad_id"), parecido: top[0].sim, ejemplo: top[0].e.descripcion };
}

/** Nivel de una confianza para filtrar y agrupar: Alta (80 o más), Media (50 a 79), Baja. */
export function nivelConfianza(confianza: number | null): "Alta" | "Media" | "Baja" | "Sin sugerencia" {
  if (confianza === null) return "Sin sugerencia";
  return confianza >= 80 ? "Alta" : confianza >= 50 ? "Media" : "Baja";
}
