// Anuncios Meta › ordenar por métricas en Campañas, Productos, Videos y Qué funciona (25 nov 2026, pedido de Alcides: «que también se puedan ordenar por métricas… y que a futuro se puedan agregar más órdenes»). Un solo motor para todas las listas:
// las métricas salen del catálogo de columnas (`columnas.ts`), así una métrica nueva se puede ordenar sola; cada lista suma sus propios órdenes (nombre, campañas, fecha…) con una línea; y cada persona puede encadenar hasta tres («luego por»).
// Lógica pura, con prueba.

import { CATALOGO_COLUMNAS, numeroColumna, type ContextoColumna } from "./columnas";
import { confiable, cpa, type Resultados } from "./metricas";

export type Sentido = "asc" | "desc";

export interface CriterioOrden<F> {
  valor: string;
  etiqueta: string;
  /** El título del grupo en la lista desplegable (Resultados, Entrega, Video, Landing o el de la lista). */
  grupo: string;
  /** El sentido en que «lo mejor» va primero: es el que se pone al elegirlo. */
  sentido: Sentido;
  /** El valor por el que se ordena una fila; null = no tiene ese dato (va siempre al final). */
  de: (fila: F) => number | string | null;
}

export interface Orden {
  criterio: string;
  sentido: Sentido;
}

/** Cuántos órdenes se pueden encadenar: «ordenar por» y dos «luego por». */
export const MAX_ORDENES = 3;

/** Lo que cada fila aporta para ordenar por cualquier métrica del catálogo. */
export type ResultadosDeFila<F> = (fila: F) => { r: Resultados; ctx: ContextoColumna };

/** Un criterio por cada métrica del catálogo de columnas. `sinFrecuencia` en las listas donde no existe (videos y productos). */
export function criteriosDeMetricas<F>(de: ResultadosDeFila<F>, sinFrecuencia = false): CriterioOrden<F>[] {
  return CATALOGO_COLUMNAS.filter((c) => !(sinFrecuencia && c.clave === "frecuencia")).map((c) => ({
    valor: c.clave,
    etiqueta: c.titulo,
    grupo: c.grupo,
    sentido: c.menorEsMejor ? "asc" : "desc",
    de: (f: F) => {
      const x = de(f);
      return numeroColumna(c.clave, x.r, x.ctx);
    },
  }));
}

/** «Mejor resultado»: el CPA más bajo, pero primero lo que ya tiene gasto suficiente para compararse (una cifra con $20 no dice nada). */
export function criterioMejor<F>(de: ResultadosDeFila<F>, grupo = "Recomendado"): CriterioOrden<F> {
  return {
    valor: "mejor",
    etiqueta: "Mejor resultado (CPA con data suficiente)",
    grupo,
    sentido: "asc",
    de: (f) => {
      const { r } = de(f);
      const costo = cpa(r);
      return costo === null ? null : (confiable(r) ? 0 : 1_000_000) + costo;
    },
  };
}

const comparar = (x: number | string, y: number | string) => (typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y), "es", { numeric: true }) : x - y);

/**
 * Las filas ordenadas por los criterios, en su orden (el primero manda; el segundo desempata, y así). Lo que no tiene el dato queda al final suba o baje el orden. Si todo empata, `desempate` (por ejemplo el gasto, de mayor a menor).
 * No cambia la lista que recibe.
 */
export function ordenarPor<F>(filas: readonly F[], criterios: readonly CriterioOrden<F>[], ordenes: readonly Orden[], desempate?: (fila: F) => number): F[] {
  const usados = ordenes.flatMap((o) => {
    const c = criterios.find((x) => x.valor === o.criterio);
    return c ? [{ c, signo: o.sentido === "asc" ? 1 : -1 }] : [];
  });
  return [...filas].sort((a, b) => {
    for (const { c, signo } of usados) {
      const x = c.de(a);
      const y = c.de(b);
      if (x === null && y === null) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      const d = comparar(x, y);
      if (d !== 0) return d * signo;
    }
    return desempate ? desempate(b) - desempate(a) : 0;
  });
}

/** Lo guardado en el navegador, validado: solo criterios que existen en esa lista, sin repetir y hasta tres; si no queda nada, lo de por defecto. */
export function ordenValido<F>(guardado: unknown, criterios: readonly CriterioOrden<F>[] | readonly string[], porDefecto: Orden[]): Orden[] {
  if (!Array.isArray(guardado)) return porDefecto;
  const existe = new Set(criterios.map((c) => (typeof c === "string" ? c : c.valor)));
  const vistos = new Set<string>();
  const out: Orden[] = [];
  for (const g of guardado) {
    const o = g as Partial<Orden> | null;
    if (!o || typeof o.criterio !== "string" || !existe.has(o.criterio) || vistos.has(o.criterio)) continue;
    vistos.add(o.criterio);
    out.push({ criterio: o.criterio, sentido: o.sentido === "asc" ? "asc" : "desc" });
    if (out.length >= MAX_ORDENES) break;
  }
  return out.length ? out : porDefecto;
}

/** El primer criterio que todavía no se usa: con el que arranca un «luego por» nuevo. null si ya no cabe otro. */
export function siguienteCriterio<F>(criterios: readonly CriterioOrden<F>[], ordenes: readonly Orden[]): Orden | null {
  if (ordenes.length >= MAX_ORDENES) return null;
  const usados = new Set(ordenes.map((o) => o.criterio));
  const preferidos = ["gasto", "compras", "cpa"];
  const c = preferidos.map((v) => criterios.find((x) => x.valor === v && !usados.has(v))).find(Boolean) ?? criterios.find((x) => !usados.has(x.valor));
  return c ? { criterio: c.valor, sentido: c.sentido } : null;
}
