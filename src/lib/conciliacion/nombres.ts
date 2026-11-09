// Reconocer a una persona (un repartidor, quien compró) en la descripción de una línea del banco. Lógica pura; prueba en
// `nombres.test.ts`.
//
// El banco escribe los nombres a su manera: completos («TRANSFERENCIA DE ANA MARIA DEMO PRUEBA»), cortados por el ancho
// de la columna («ACH CRE ANA MARIA DEMO PRU»), al revés y con barra («ATM DEPOSITO DE PRUEBA/ANA») o con una letra
// cambiada respecto de cómo los anota la hoja de deliverys («ANI» / «ANY»). Se compara palabra por palabra.

import { normal } from "./leer-excel";

/** Palabras de una zona o de relleno: «ZONA 5 ANA», «ANA CIUDAD», «LA CHORRERA» no son parte del nombre. */
const NO_SON_NOMBRE = new Set(["ZONA", "CIUDAD", "CHORRERA", "ARRAIJAN", "OFICINA", "LA", "EL", "LOS", "LAS", "DE", "DEL", "Y", "SERVIENTREGA"]);

/** Las palabras de un nombre: mayúsculas, sin acentos, sin números ni palabras de zona, de 3 letras o más. */
export function palabrasNombre(nombre: string | null | undefined): string[] {
  return normal(nombre ?? "")
    .split(/[^A-Z0-9]+/)
    .filter((x) => x.length >= 3 && !/\d/.test(x) && !NO_SON_NOMBRE.has(x));
}

const palabrasDescripcion = (descripcion: string) => normal(descripcion).split(/[^A-Z0-9]+/).filter((x) => x.length >= 3);

/** Distancia de edición, cortando apenas pasa de 1 (solo se pregunta si es 0 o 1). */
function aLoSumoUno(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Una palabra del nombre calza con una de la descripción: igual, una letra distinta, o la del banco cortada. */
export function palabraCalza(nombre: string, banco: string): boolean {
  if (nombre === banco) return true;
  if (nombre.length < 4 || banco.length < 4) return false;
  return aLoSumoUno(nombre, banco) || nombre.startsWith(banco);
}

/**
 * Si la descripción nombra a la persona: TODAS las palabras de su nombre están (un nombre de una sola palabra necesita 6
 * letras o más: «DEMOSTRA» sí, «ANA» no).
 */
export function nombreEnDescripcion(nombre: string | null | undefined, descripcion: string): boolean {
  const n = palabrasNombre(nombre);
  if (!n.length || (n.length === 1 && n[0].length < 6)) return false;
  const d = palabrasDescripcion(descripcion);
  return n.every((x) => d.some((y) => palabraCalza(x, y)));
}

/** Cuántas palabras del nombre de quien compró aparecen en la descripción (se pide 2 o más para darlo por visto). */
export function palabrasEnComun(nombre: string | null | undefined, descripcion: string): number {
  const d = palabrasDescripcion(descripcion);
  return [...new Set(palabrasNombre(nombre))].filter((x) => d.some((y) => palabraCalza(x, y))).length;
}

/** La tienda que nombra la descripción («Cierre 010926 oferfy»), entre las etiquetas dadas (OFERFY, KENKU…). */
export function tiendaEnDescripcion(descripcion: string, etiquetas: string[]): string | null {
  const d = palabrasDescripcion(descripcion);
  const halladas = etiquetas.filter((e) => palabrasNombre(e).some((x) => d.includes(x)));
  return halladas.length === 1 ? halladas[0] : null;
}
