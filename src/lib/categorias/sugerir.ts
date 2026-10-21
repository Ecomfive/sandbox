// Sugerir la categoría de un producto nuevo por parecidos (pedido de Alcides, 19 oct 2026): se compara su nombre y la huella de
// su foto con los productos ya clasificados (la misma comparación del aviso de duplicados, `src/lib/wms/duplicados.ts`) y cada
// parecido «vota» por su categoría con lo que se parece. Sin base ni React, para poder probarlo.
import { distanciaHuella, palabrasClave, parecidoNombre } from "../wms/duplicados";

export interface EjemploCategoria {
  nombre: string;
  huella: string | null;
  categoriaId: string;
  ruta: string;
}

export interface SugerenciaCategoria {
  id: string;
  ruta: string;
  /** 0 a 1: qué tan parecida es al mejor ejemplo de esa categoría. */
  puntaje: number;
  /** Los productos parecidos que la sugieren (hasta 3), para que la persona vea por qué. */
  ejemplos: string[];
}

/** Un parecido cuenta desde aquí: la mitad de las palabras en común (y 2 o más) o una foto a 10 bits o menos. */
const MIN_NOMBRE = 0.5;
const MAX_BITS = 10;

/** Qué tanto se parece un ejemplo al producto nuevo (0 a 1), por nombre o por foto (lo mayor). */
export function parecido(palabras: string[], huella: string | null, e: EjemploCategoria): number {
  const otras = palabrasClave(e.nombre);
  const comunes = palabras.filter((p) => otras.includes(p)).length;
  const porNombre = palabras.length && (comunes >= 2 || (palabras.length === 1 && comunes === 1)) ? parecidoNombre(palabras, otras) : 0;
  const bits = huella && e.huella ? distanciaHuella(huella, e.huella) : 64;
  const porFoto = bits <= MAX_BITS ? 1 - bits / (MAX_BITS * 2) : 0;
  return Math.max(porNombre >= MIN_NOMBRE ? porNombre : 0, porFoto);
}

/**
 * Las categorías más probables (hasta `limite`), de la más a la menos: suma lo que se parecen los 10 ejemplos más parecidos de
 * cada una (así una categoría con varios parecidos gana a una con uno solo).
 */
export function sugerirPorParecidos(nombre: string, huella: string | null, ejemplos: EjemploCategoria[], limite = 3): SugerenciaCategoria[] {
  const palabras = palabrasClave(nombre);
  if (!palabras.length && !huella) return [];
  const parecidos = ejemplos
    .map((e) => ({ e, p: parecido(palabras, huella, e) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .slice(0, 10);
  const porCategoria = new Map<string, { ruta: string; suma: number; mejor: number; ejemplos: string[] }>();
  for (const { e, p } of parecidos) {
    const c = porCategoria.get(e.categoriaId) ?? { ruta: e.ruta, suma: 0, mejor: 0, ejemplos: [] };
    c.suma += p;
    c.mejor = Math.max(c.mejor, p);
    if (c.ejemplos.length < 3 && !c.ejemplos.includes(e.nombre)) c.ejemplos.push(e.nombre);
    porCategoria.set(e.categoriaId, c);
  }
  return [...porCategoria]
    .sort((a, b) => b[1].suma - a[1].suma)
    .slice(0, limite)
    .map(([id, c]) => ({ id, ruta: c.ruta, puntaje: Math.round(c.mejor * 100) / 100, ejemplos: c.ejemplos }));
}
