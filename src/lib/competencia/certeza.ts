// Análisis de competencia › qué tan seguro es que un producto de la competencia sea **el mismo** que el nuestro (7 nov 2026, pedido de Hernán: «tiene que ser el
// mismo o exacto»; se comparaba un shilajit «8 en 1» con uno «puro, 92 minerales, 30 cápsulas» y salía más barato que nosotros). El emparejamiento automático
// (`yaVisto`, por nombre parecido o por foto) encuentra candidatos; esto decide si el candidato es **exacto** —y entonces cuenta para precios, posiciones y
// alertas— o solo **dudoso**, que se muestra como tal y no se compara. Sin base ni React, con prueba.
//
// Exacto por nombre: las mismas palabras (sin las de relleno: «de», «cápsulas», «natural», «CR»…), los mismos números y el mismo tamaño si los dos lo dicen.
// Exacto por foto: misma foto y las palabras de uno contenidas en las del otro, sin números ni tamaños que choquen. Todo lo demás, dudoso. La foto se mira
// siempre que los dos la tengan, se hayan emparejado por nombre o por foto (7 nov 2026, Hernán: «también debes tomar en cuenta las fotos»).

import { distanciaHuella, UMBRAL_FOTO } from "@/lib/wms/duplicados";
import { medidaEnNombre, unidadesEnNombre } from "./analisis";

export type Certeza = "exacto" | "dudoso";

/** Palabras que no distinguen un producto de otro: artículos, presentación, adornos de venta y nombres de tienda o de país. */
const RELLENO = new Set(
  (
    "de del la las el los en con para y e o x por al a sin the of and " +
    "capsula caps cap cps softgel tableta tab gomita gummie gummy ml g gr grs gramo mg oz unidad unid und ud frasco pack combo " +
    "original premium nuevo nueva natural producto cr costa rica privado privada full ecom travel etravel sdg oferta promo"
  ).split(" "),
);

/** Una palabra sin plural: «vaginales» → «vaginal», «probióticos» → «probiotico». */
const singular = (p: string) => (p.length > 5 && /[lrnd]es$/.test(p) ? p.slice(0, -2) : p.length > 3 && p.endsWith("s") ? p.slice(0, -1) : p);

interface Huella {
  palabras: Set<string>;
  numeros: Set<string>;
  medida: { tipo: string; cantidad: number } | null;
  unidades: number;
}

function huella(nombre: string): Huella {
  let t = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  // El contenido y las unidades se comparan aparte (`medidaEnNombre`, `unidadesEnNombre`): sus números no cuentan como «otros números».
  t = t
    .replace(/(\d+(?:[.,]\d+)?)\s*(capsulas?|caps?|cps|softgels?|tabletas?|tabs|gomitas?|gummies|ml|g|gr|grs|gramos|mg|oz|unidades|unid|und|uds|pares|frascos?)\b/g, " ")
    .replace(/\bpack\s*[-x]?\s*\d+\b/g, " ")
    .replace(/\b\d+\s*x\s*1\b/g, " ")
    .replace(/(?:^|\s)x\s*\d+\b/g, " ");
  const fichas = t.split(/[^a-z0-9]+/).filter(Boolean);
  const numeros = new Set(fichas.flatMap((f) => f.match(/\d+/g) ?? []));
  const palabras = new Set(
    fichas
      .map((f) => f.replace(/\d+/g, ""))
      .filter((f) => f.length >= 2)
      .map(singular)
      .filter((f) => !RELLENO.has(f)),
  );
  return { palabras, numeros, medida: medidaEnNombre(nombre), unidades: unidadesEnNombre(nombre) };
}

const iguales = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const contenido = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));
const unoEnOtro = (a: Set<string>, b: Set<string>) => contenido(a, b) || contenido(b, a);

/** Un producto para comparar: su nombre y, si se calculó, la huella de su foto. */
export interface ParaComparar {
  nombre: string;
  huella?: string | null;
}

/** Las dos fotos son la misma (o casi): la misma huella, a pocos bits. */
export function mismaFoto(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && distanciaHuella(a, b) <= UMBRAL_FOTO;
}

/** Si el producto de la competencia es el mismo que el nuestro. `metodo` es cómo lo emparejó la búsqueda: «foto» o «nombre»; si las dos fotos son la misma, cuenta como «foto» aunque se emparejara por nombre. */
export function certezaIgual(nuestroP: ParaComparar | string, otroP: ParaComparar | string, metodo: string | null): Certeza {
  const nuestro = typeof nuestroP === "string" ? { nombre: nuestroP } : nuestroP;
  const otro = typeof otroP === "string" ? { nombre: otroP } : otroP;
  if (mismaFoto(nuestro.huella, otro.huella)) metodo = "foto";
  const a = huella(nuestro.nombre);
  const b = huella(otro.nombre);
  if (!a.palabras.size || !b.palabras.size) return "dudoso";
  if (a.unidades !== b.unidades) return "dudoso";
  // Dos tamaños distintos (60 frente a 120 cápsulas) son otro producto; si solo uno lo dice, no choca.
  if (a.medida && b.medida && (a.medida.tipo !== b.medida.tipo || a.medida.cantidad !== b.medida.cantidad)) return "dudoso";
  if (metodo === "foto") return unoEnOtro(a.palabras, b.palabras) && unoEnOtro(a.numeros, b.numeros) ? "exacto" : "dudoso";
  return iguales(a.palabras, b.palabras) && iguales(a.numeros, b.numeros) ? "exacto" : "dudoso";
}
