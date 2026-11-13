// Gestión de IDs Dropi › tarjeta «Pareto de publicaciones» (12 nov 2026, pedido de Hernán: el 20 % de las publicaciones que trae el 80 % de las guías).
// Las guías llegan por ID de producto de Dropi (`dropi_guias_por_producto`, migración 0281) y aquí se juntan por publicación: una publicación con dos IDs
// («6667-8295») suma los dos. Un ID que no es de ninguna publicación del país entra solo, como «sin publicación». Sin base ni React, con prueba.

import { pareto, type ResultadoPareto } from "@/lib/crm/pareto";
import { idsDropi } from "./publicacion";

export interface PublicacionPareto {
  id: string;
  dropiId: string;
  archivada: boolean;
  duplicadaDe?: string | null;
}

/** La clave de un ID de Dropi sin publicación en el análisis (las publicaciones van con su id del sistema). */
export const claveSinPublicacion = (dropiId: string) => `dropi:${dropiId}`;
export const esSinPublicacion = (clave: string) => clave.startsWith("dropi:");

/**
 * De qué publicación es cada ID de Dropi. Cada ID tiene una sola publicación por país; si quedó repetido (una «Duplicada de…» de la importación de ClickUp),
 * manda la que no es duplicada y, después, la que no está archivada.
 */
export function publicacionDeCadaId(publicaciones: readonly PublicacionPareto[]): Map<string, string> {
  const peso = (p: PublicacionPareto) => (p.duplicadaDe ? 2 : 0) + (p.archivada ? 1 : 0);
  const dueno = new Map<string, PublicacionPareto>();
  for (const p of publicaciones)
    for (const id of idsDropi(p.dropiId)) {
      const k = String(id);
      const actual = dueno.get(k);
      if (!actual || peso(p) < peso(actual)) dueno.set(k, p);
    }
  return new Map([...dueno].map(([k, p]) => [k, p.id]));
}

/** Las guías de cada publicación (la suma de sus IDs) y las de los IDs sin publicación, para el análisis. */
export function guiasPorPublicacion(guiasPorId: Readonly<Record<string, number>>, deCadaId: ReadonlyMap<string, string>): Map<string, number> {
  const por = new Map<string, number>();
  for (const [id, guias] of Object.entries(guiasPorId)) {
    if (!(guias > 0)) continue;
    const clave = deCadaId.get(id) ?? claveSinPublicacion(id);
    por.set(clave, (por.get(clave) ?? 0) + guias);
  }
  return por;
}

/** Las guías de cada ID en los últimos `k` meses de sus series mes a mes. */
export function guiasDeLosMeses(porMes: Readonly<Record<string, readonly number[]>>, k: number): Record<string, number> {
  return Object.fromEntries(Object.entries(porMes).map(([id, v]) => [id, v.slice(Math.max(0, v.length - k)).reduce((s, x) => s + x, 0)]));
}

/** El Pareto de las publicaciones: quiénes son el 20 % que más guías trae y qué parte hacen. */
export function paretoPublicaciones(guiasPorId: Readonly<Record<string, number>>, deCadaId: ReadonlyMap<string, string>): ResultadoPareto {
  return pareto([...guiasPorPublicacion(guiasPorId, deCadaId)].map(([id, valor]) => ({ id, valor })));
}

/** Las guías de cada ID mes a mes (en el orden de `meses`), de las filas de `dropi_guias_por_producto`; y las de los últimos 30 días. */
export function guiasPorIdDeFilas(filas: readonly { producto_id: number | string; mes: string; pedidos: number; pedidos_30: number }[], meses: readonly string[]) {
  const indice = new Map(meses.map((m, i) => [m, i]));
  const porMes: Record<string, number[]> = {};
  const dias30: Record<string, number> = {};
  for (const f of filas) {
    const id = String(f.producto_id);
    const i = indice.get(String(f.mes).slice(0, 10));
    if (i !== undefined) (porMes[id] ??= new Array<number>(meses.length).fill(0))[i] += Number(f.pedidos) || 0;
    const d = Number(f.pedidos_30) || 0;
    if (d > 0) dias30[id] = (dias30[id] ?? 0) + d;
  }
  return { porMes, dias30 };
}
