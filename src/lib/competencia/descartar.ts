/**
 * «No es el mismo» (8 nov 2026, pedido de Alcides: el corrector de postura salía con un competidor más barato que vende otro corrector): una persona descarta
 * un producto de la competencia para uno de los nuestros. Se guarda como veredicto «distinto» en `competencia_verificaciones` (migración 0246, la misma de la
 * IA), así deja de contar en la ficha, en «Competidor más barato», en las recomendaciones de precio y en Análisis de competencia. Lógica pura, con prueba.
 */

import { claveVerificacion } from "./verificar-ia";

/** El motivo que queda guardado cuando lo descarta una persona (lo de la IA trae el suyo). */
export const MOTIVO_A_MANO = "Descartado a mano: no es el mismo producto";

/** Las claves «competidor|nuestro» de los pares que se vieron como distintos. */
export const clavesDistintas = (filas: readonly { producto_id: string; nuestro_id: string; veredicto: string }[]): Set<string> =>
  new Set(filas.filter((f) => f.veredicto === "distinto").map((f) => claveVerificacion(f.producto_id, f.nuestro_id)));

/** ¿Este competidor está descartado para alguno de nuestros productos? */
export const descartadoPara = (competidorId: string, nuestrosIds: readonly string[], distintas: ReadonlySet<string>): boolean =>
  nuestrosIds.some((n) => distintas.has(claveVerificacion(competidorId, n)));

/** Separa los competidores en los que cuentan y los descartados (sin cambiar el orden). */
export function separarDescartados<T extends { id: string }>(competidores: readonly T[], nuestrosIds: readonly string[], distintas: ReadonlySet<string>): { cuentan: T[]; descartados: T[] } {
  const cuentan: T[] = [];
  const descartados: T[] = [];
  for (const c of competidores) (descartadoPara(c.id, nuestrosIds, distintas) ? descartados : cuentan).push(c);
  return { cuentan, descartados };
}
