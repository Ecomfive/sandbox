// La lupa de las tablas: encuentra lo escrito aunque tenga un error de dedo o de ortografía («escalvo» → «Excalvo»,
// «shampo» → «Shampoo», «vitaminas» → «bitaminas»). Lógica pura, con su prueba.
//
// Una fila coincide si contiene el texto tal cual (sin mayúsculas ni acentos) o si **cada palabra** buscada se parece a alguna
// palabra de la fila: igual sonando en español (x/s, z/c, b/v, ll/y, h muda, letras dobles) o a una letra de distancia (dos
// en palabras de 10 letras o más). Las palabras de menos de 5 letras y los números se buscan tal cual, para no traer de más.

import { normalizar } from "./motor";

/** Cómo suena en español: las letras que se confunden al escribir quedan iguales. */
export function sonido(palabra: string): string {
  return palabra
    .replace(/h/g, "")
    .replace(/ll/g, "y")
    .replace(/qu/g, "k")
    .replace(/c([ei])/g, "s$1")
    .replace(/[xz]/g, "s")
    .replace(/c/g, "k")
    .replace(/v/g, "b")
    .replace(/w/g, "u")
    .replace(/(.)\1+/g, "$1");
}

/** Distancia entre dos palabras (cambiar, quitar o poner una letra, o cambiar dos de lugar), con un tope para cortar antes. */
function distancia(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let previa2: number[] = [];
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let minimo = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, previa2[j - 2] + 1);
      fila.push(v);
      minimo = Math.min(minimo, v);
    }
    if (minimo > tope) return tope + 1;
    previa2 = previa;
    previa = fila;
  }
  return previa[b.length];
}

const palabras = (t: string) => normalizar(t).split(/[^a-z0-9ñ]+/).filter(Boolean);

/** Si una palabra buscada se parece a una palabra del texto (o al principio de ella, mientras se escribe). */
function seParece(buscada: string, delTexto: string): boolean {
  if (delTexto.includes(buscada)) return true;
  if (buscada.length < 5 || /^\d+$/.test(buscada)) return false;
  const sb = sonido(buscada);
  const st = sonido(delTexto);
  if (st.includes(sb)) return true;
  const tope = buscada.length >= 10 ? 2 : 1;
  // Contra la palabra entera y contra su comienzo del mismo largo (se está escribiendo «escal…»).
  return distancia(sb, st, tope) <= tope || distancia(sb, st.slice(0, sb.length), tope) <= tope;
}

/**
 * Prepara la búsqueda una sola vez y devuelve la función que dice si un texto coincide. Sin nada escrito, todo coincide.
 */
export function crearBuscador(busqueda: string): (texto: string) => boolean {
  const q = normalizar(busqueda.trim());
  if (!q) return () => true;
  const buscadas = palabras(q);
  return (texto: string) => {
    const t = normalizar(texto);
    if (t.includes(q)) return true;
    if (buscadas.length === 0) return false;
    const delTexto = palabras(t);
    return buscadas.every((b) => delTexto.some((p) => seParece(b, p)));
  };
}
