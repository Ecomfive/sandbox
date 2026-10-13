// Posibles duplicados al crear un producto (13 oct 2026): se compara el nombre (sus palabras útiles) y la foto (su huella,
// `src/lib/wms/huella-foto.ts`) con los productos que ya existen. Es solo un aviso: la persona decide. Sin React ni base, para
// poder probarlo.

import { palabraSku } from "./sugerir-sku";

const RELLENO = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "para", "con", "sin", "en", "por", "a", "al", "un", "una", "x", "dr", "dra", "kit", "set", "pack", "unidad", "unidades", "und"]);

/** Las palabras que identifican un producto: sin acentos, sin relleno, sin medidas ni números («2x1», «50ml»). */
export function palabrasClave(nombre: string): string[] {
  const palabras = nombre
    .split(/[\s/.,;:()\-–_"«»+&]+/)
    .map((p) => palabraSku(p).toLowerCase())
    .filter((p) => p.length >= 2 && !RELLENO.has(p) && !/^\d/.test(p));
  return [...new Set(palabras)];
}

/**
 * Qué tanto se parecen dos nombres (0 a 1): las palabras en común sobre las del nombre más corto. «Aceite de orégano» y
 * «OreganoOil Aceite de orégano 30ml» dan 1. Dos palabras se cuentan iguales si una empieza por la otra y la corta tiene al
 * menos 4 letras («magnetic» / «magneticas»).
 */
export function parecidoNombre(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  const igual = (x: string, y: string) => x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));
  const comunes = corto.filter((p) => largo.some((q) => igual(p, q))).length;
  return comunes / corto.length;
}

/** Distancia entre dos huellas de foto (64 bits en 16 cifras hexadecimales): cuántos bits cambian. */
export function distanciaHuella(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 64;
  let d = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Desde cuánto se avisa: nombres con al menos el 75 % de palabras en común (y 2 o más) o fotos a 10 bits o menos. */
export const UMBRAL_NOMBRE = 0.75;
export const UMBRAL_FOTO = 10;

export interface CandidatoDuplicado {
  id: string;
  codigo: string;
  nombre: string;
  foto: string | null;
  huella: string | null;
}

export interface PosibleDuplicado extends Omit<CandidatoDuplicado, "huella"> {
  porNombre: boolean;
  porFoto: boolean;
}

/** Los productos que podrían ser el mismo, los más parecidos primero (hasta `limite`). */
export function posiblesDuplicados(nombre: string, huella: string | null, candidatos: CandidatoDuplicado[], limite = 5): PosibleDuplicado[] {
  const clave = palabrasClave(nombre);
  const exacto = clave.join(" ");
  return candidatos
    .map((c) => {
      const otras = palabrasClave(c.nombre);
      const parecido = parecidoNombre(clave, otras);
      const porNombre = (exacto !== "" && otras.join(" ") === exacto) || (parecido >= UMBRAL_NOMBRE && Math.min(clave.length, otras.length) >= 2);
      const distancia = huella && c.huella ? distanciaHuella(huella, c.huella) : 64;
      const porFoto = distancia <= UMBRAL_FOTO;
      return { c, porNombre, porFoto, puntos: (porFoto ? 2 + (UMBRAL_FOTO - distancia) / UMBRAL_FOTO : 0) + (porNombre ? 1 + parecido : 0) };
    })
    .filter((x) => x.porNombre || x.porFoto)
    .sort((x, y) => y.puntos - x.puntos)
    .slice(0, limite)
    .map(({ c, porNombre, porFoto }) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, foto: c.foto, porNombre, porFoto }));
}
