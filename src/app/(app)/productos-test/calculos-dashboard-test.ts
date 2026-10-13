import type { FilaProductoTest } from "./def-productos-test";
import { etiquetaTestNumero } from "./def-productos-test";
import { agrupar, CPA_OBJETIVO, claveDe, estadisticas, etiquetaCorta, etiquetaPeriodo, limpiarCategoria, promedio, resultadoDe, type Granularidad, type Resultado } from "./informe";

/**
 * Lógica pura del Dashboard de Test productos (sin React ni base de datos): filtrar, armar las series de las gráficas y
 * comparar. Reutiliza la de los informes (`informe.ts`): mismo criterio de winner, mismos periodos y mismas categorías.
 */

export interface FiltrosTest {
  desde: string;
  hasta: string;
  categoria: string;
  testNumero: string;
  resultado: "" | Resultado;
}
export const SIN_FILTROS_TEST: FiltrosTest = { desde: "", hasta: "", categoria: "", testNumero: "", resultado: "" };

/** El Test # de una fila para filtrar y comparar («sin» si no tiene). */
export const claveTestNumero = (f: FilaProductoTest) => f.testNumero ?? "sin";
export const etiquetaClaveTestNumero = (clave: string) => (clave === "sin" ? "Sin test #" : (etiquetaTestNumero(clave) ?? clave));

/** Las filas que pasan los filtros. Las fechas comparan la fecha del test; sin fecha, un filtro de fechas las deja fuera. */
export function filtrarTests(filas: FilaProductoTest[], f: FiltrosTest): FilaProductoTest[] {
  return filas.filter(
    (p) =>
      (!f.desde || (p.fechaTest !== null && p.fechaTest >= f.desde)) &&
      (!f.hasta || (p.fechaTest !== null && p.fechaTest <= f.hasta)) &&
      (!f.categoria || limpiarCategoria(p.categoria) === f.categoria) &&
      (!f.testNumero || claveTestNumero(p) === f.testNumero) &&
      (!f.resultado || resultadoDe(p.estado) === f.resultado),
  );
}

export interface PuntoSerie {
  clave: string;
  etiqueta: string;
  nombre: string;
  ganadores: number;
  fallidos: number;
  consulta: number;
  otros: number;
  /** Porcentaje de winners del periodo (null sin tests). */
  tasa: number | null;
}

/** Tests por periodo (día, semana o mes de la fecha del test), con cuántos ganaron, fallaron o están en consulta. */
export function serieTests(filas: FilaProductoTest[], g: Granularidad): PuntoSerie[] {
  return agrupar(filas, g).map((p) => {
    const s = estadisticas(p.filas);
    return {
      clave: p.clave,
      etiqueta: etiquetaCorta(p.clave, g),
      nombre: etiquetaPeriodo(p.clave, g, true),
      ganadores: s.ganadores,
      fallidos: s.fallidos,
      consulta: s.consulta,
      otros: s.otros,
      tasa: s.testeados ? Math.round(s.tasa * 10) / 10 : null,
    };
  });
}

export interface RangoCpa {
  rango: string;
  /** El rango queda por debajo del criterio (todo su CPA es menor a $4). */
  cumple: boolean;
  ganadores: number;
  fallidos: number;
  otros: number;
}

/** Cuántos tests caen en cada rango de CPA de $1 (de $0 a $10, y «$10 o más»). Los que no tienen CPA no entran. */
export function histogramaCpa(filas: FilaProductoTest[]): RangoCpa[] {
  const rangos: RangoCpa[] = Array.from({ length: 11 }, (_, i) => ({
    rango: i < 10 ? `$${i}–${i + 1}` : "$10+",
    cumple: i + 1 <= CPA_OBJETIVO,
    ganadores: 0,
    fallidos: 0,
    otros: 0,
  }));
  for (const f of filas) {
    if (f.metricaCpa === null) continue;
    const r = rangos[Math.min(10, Math.max(0, Math.floor(f.metricaCpa)))];
    const res = resultadoDe(f.estado);
    if (res === "ganador") r.ganadores++;
    else if (res === "fallido") r.fallidos++;
    else r.otros++;
  }
  return rangos;
}

export interface MetricaComparada {
  id: string;
  nombre: string;
  ganadores: number | null;
  fallidos: number | null;
  /** «mas» si un valor más alto es mejor (CTR), «menos» si más bajo es mejor (CPA, CPM). */
  mejor: "mas" | "menos";
  formato: "usd" | "porcentaje" | "numero";
}

/** El promedio de cada métrica de Meta en los winners y en los fallidos: qué distingue a un producto que gana. */
export function winnersVsFallidos(filas: FilaProductoTest[]): MetricaComparada[] {
  const g = filas.filter((f) => resultadoDe(f.estado) === "ganador");
  const x = filas.filter((f) => resultadoDe(f.estado) === "fallido");
  const m = (id: string, nombre: string, valor: (f: FilaProductoTest) => number | null, mejor: "mas" | "menos", formato: MetricaComparada["formato"]): MetricaComparada => ({
    id,
    nombre,
    ganadores: promedio(g, valor),
    fallidos: promedio(x, valor),
    mejor,
    formato,
  });
  return [
    m("cpa", "CPA", (f) => f.metricaCpa, "menos", "usd"),
    m("ctr", "CTR", (f) => f.metricaCtr, "mas", "porcentaje"),
    m("hook", "Hook rate", (f) => f.metricaHookRate, "mas", "porcentaje"),
    m("cvr", "CVR", (f) => f.metricaCvr, "mas", "porcentaje"),
    m("cpm", "CPM", (f) => f.metricaCpm, "menos", "usd"),
    m("compras", "Compras", (f) => f.metricaCompras, "mas", "numero"),
    m("gasto", "Gasto", (f) => f.metricaGasto, "menos", "usd"),
  ];
}

export interface PuntoDispersion {
  id: string;
  nombre: string;
  ctr: number;
  cpa: number;
  resultado: Resultado;
}

/** Un punto por test con CTR y CPA, para ver si el CTR anticipa el CPA. */
export function dispersionCtrCpa(filas: FilaProductoTest[]): PuntoDispersion[] {
  return filas
    .filter((f) => f.metricaCtr !== null && f.metricaCpa !== null)
    .map((f) => ({ id: f.id, nombre: f.nombre, ctr: f.metricaCtr!, cpa: f.metricaCpa!, resultado: resultadoDe(f.estado) }));
}

export type DimensionTest = "categoria" | "testNumero" | "semana";

export const CLAVE_DIMENSION: Record<DimensionTest, (f: FilaProductoTest) => string | null> = {
  categoria: (f) => limpiarCategoria(f.categoria),
  testNumero: claveTestNumero,
  semana: (f) => (f.fechaTest ? claveDe(f.fechaTest, "semana") : null),
};

export interface FilaComparada {
  clave: string;
  testeados: number;
  ganadores: number;
  tasa: number;
  gasto: number;
  compras: number;
  cpa: number | null;
  costoPorGanador: number | null;
}

/** Testeados, winners, tasa, gasto, CPA global y costo por winner por categoría, Test # o semana; los de más tests primero. */
export function compararPor(filas: FilaProductoTest[], dimension: DimensionTest): FilaComparada[] {
  const grupos = new Map<string, FilaProductoTest[]>();
  for (const f of filas) {
    const k = CLAVE_DIMENSION[dimension](f);
    if (k === null) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return [...grupos.entries()]
    .map(([clave, fs]) => {
      const s = estadisticas(fs);
      return { clave, testeados: s.testeados, ganadores: s.ganadores, tasa: s.tasa, gasto: s.gasto, compras: s.compras, cpa: s.cpa, costoPorGanador: s.costoPorGanador };
    })
    .sort((a, b) => (dimension === "semana" ? b.clave.localeCompare(a.clave) : b.testeados - a.testeados || a.clave.localeCompare(b.clave)));
}
