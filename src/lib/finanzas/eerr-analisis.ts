// Portal AF4 360° › Análisis del Estado de resultados (mejoras 29, 30, 31, 34 y 35). Lógica pura sobre las filas del EERR
// (`FilaEerr`): comparación contra el mismo período del año anterior, total móvil de 12 meses (TTM), EERR con una
// columna por tienda o por canal de venta, y el resultado antes y después del reparto de A DISTRIBUIR.
// Prueba en `eerr-analisis.test.ts`.

import { desdeEerr, type FilaAF4 } from "@/lib/af4/tabla-financiera";
import { armarEerr, total, type Eerr, type FilaEerr } from "./eerr";
import { filasEstado } from "./eerr-filas";

/** El mes `n` meses después (o antes, con n negativo) de `p` (AAAA-MM-01). */
export function moverMes(p: string, n: number): string {
  const t = Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

// ---------------------------------------------------------------------------------------------
// 30. Últimos 12 meses (TTM)
// ---------------------------------------------------------------------------------------------

/**
 * El EERR en total móvil: el valor de cada mes es la suma de ese mes y los 11 anteriores. `completos` dice qué meses
 * tienen sus 12 meses de historia dentro de `conDatos` (los demás suman menos de un año).
 */
export function eerrMovil(filas: FilaEerr[], meses: string[], conDatos: Iterable<string>): { eerr: Eerr; completos: Set<string> } {
  const objetivo = new Set(meses);
  const corridas: FilaEerr[] = [];
  for (const f of filas) {
    for (let i = 0; i < 12; i++) {
      const m = moverMes(f.periodo, i);
      if (objetivo.has(m)) corridas.push({ ...f, periodo: m });
    }
  }
  const primero = [...conDatos].sort()[0];
  const completos = new Set(primero ? meses.filter((m) => moverMes(m, -11) >= primero) : []);
  return { eerr: armarEerr(corridas, meses), completos };
}

// ---------------------------------------------------------------------------------------------
// 29. Mismo período del año anterior
// ---------------------------------------------------------------------------------------------

export interface Interanual {
  actual: Eerr;
  /** El mismo período un año antes, con las claves de mes del período actual (para alinear columnas). */
  anterior: Eerr;
  /** Meses del período actual cuyo mes del año anterior tiene datos. */
  conAnterior: string[];
}

/** El EERR del período y el del mismo período un año antes, alineados mes a mes. */
export function eerrInteranual(filas: FilaEerr[], meses: string[], conDatos: Iterable<string>): Interanual {
  const datos = new Set(conDatos);
  const deMes = new Map(meses.map((m) => [moverMes(m, -12), m]));
  const corridas = filas.filter((f) => deMes.has(f.periodo)).map((f) => ({ ...f, periodo: deMes.get(f.periodo)! }));
  return {
    actual: armarEerr(filas, meses),
    anterior: armarEerr(corridas, meses),
    conAnterior: meses.filter((m) => datos.has(moverMes(m, -12))),
  };
}

// ---------------------------------------------------------------------------------------------
// 31 y 34. Una columna por tienda o por canal
// ---------------------------------------------------------------------------------------------

/**
 * El EERR con una columna por grupo (tienda, canal…) en vez de por mes: suma los meses pedidos y usa la clave del grupo
 * como «mes» de `armarEerr`. Así las filas, los márgenes % y la tabla son los mismos del EERR mensual.
 */
export function eerrPorGrupo(filas: FilaEerr[], meses: string[], grupoDe: (unidadId: string) => string, grupos: string[]): Eerr {
  const enPeriodo = new Set(meses);
  const corridas = filas.filter((f) => enPeriodo.has(f.periodo)).map((f) => ({ ...f, periodo: grupoDe(f.unidad_id) }));
  return armarEerr(corridas, grupos);
}

/** Los grupos que tienen algún movimiento, en el orden dado (los demás se quitan). */
export function gruposConDatos(e: Eerr, grupos: string[]): string[] {
  return grupos.filter((g) => e.secciones.some((s) => s.tipos.some((t) => Math.abs(t.meses[g] ?? 0) >= 0.005)));
}

// ---------------------------------------------------------------------------------------------
// 35. Antes y después del reparto
// ---------------------------------------------------------------------------------------------

export interface RepartoGrupo {
  /** Resultado neto de lo cargado directo. */
  antes: Record<string, number>;
  /** Efecto de lo recibido de A DISTRIBUIR (negativo: gastos que le tocaron). */
  recibido: Record<string, number>;
  despues: Record<string, number>;
  /** Grupos con resultado positivo antes del reparto y negativo después: los gastos comunes los dejan en pérdida. */
  quedanEnPerdida: string[];
}

/** El resultado de cada grupo antes del reparto, lo que recibió y el de después. */
export function resultadoConReparto(
  directas: FilaEerr[],
  repartidas: FilaEerr[],
  meses: string[],
  grupoDe: (unidadId: string) => string,
  grupos: string[],
): RepartoGrupo {
  const enPeriodo = new Set(meses);
  const cero = () => Object.fromEntries(grupos.map((g) => [g, 0])) as Record<string, number>;
  const antes = cero();
  const recibido = cero();
  for (const f of directas) if (enPeriodo.has(f.periodo)) antes[grupoDe(f.unidad_id)] = (antes[grupoDe(f.unidad_id)] ?? 0) + f.monto * f.signo;
  for (const f of repartidas) if (enPeriodo.has(f.periodo)) recibido[grupoDe(f.unidad_id)] = (recibido[grupoDe(f.unidad_id)] ?? 0) + f.monto * f.signo;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const despues = cero();
  for (const g of grupos) {
    antes[g] = r2(antes[g] ?? 0);
    recibido[g] = r2(recibido[g] ?? 0);
    despues[g] = r2(antes[g] + recibido[g]);
  }
  return { antes, recibido, despues, quedanEnPerdida: grupos.filter((g) => antes[g] > 0 && despues[g] < 0) };
}

/** Variación porcentual contra el año anterior, o null sin base. */
export function variacionPct(actual: number, anterior: number): number | null {
  if (Math.abs(anterior) < 0.005) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

export const totalEerr = total;

const ACTUAL = "actual";
const ANTERIOR = "anterior";

/**
 * Las filas de la comparación con el año anterior para la tabla: cuatro columnas (período, mismo período un año antes,
 * variación y variación %). Un margen % lleva la diferencia en puntos y sin variación %. Un tipo que solo tuvo
 * movimiento el año anterior también aparece.
 */
export function filasInteranual(filas: FilaEerr[], meses: string[]): FilaAF4[] {
  const enPeriodo = new Set(meses);
  const deAnterior = new Set(meses.map((m) => moverMes(m, -12)));
  const corridas = filas.flatMap((f) =>
    enPeriodo.has(f.periodo) ? [{ ...f, periodo: ACTUAL }] : deAnterior.has(f.periodo) ? [{ ...f, periodo: ANTERIOR }] : [],
  );
  const columnas = [ACTUAL, ANTERIOR];
  return desdeEerr(filasEstado(armarEerr(corridas, columnas)), columnas).map((f) => {
    const [a, b] = f.valores;
    const diferencia = a !== null && b !== null ? Math.round((a - b) * 100) / 100 : null;
    const pct = f.tipo === "porcentaje" || a === null || b === null ? null : variacionPct(a, b);
    return { ...f, valores: [a, b, diferencia, pct], total: undefined };
  });
}

/** Clave de la columna de un mes en una moneda (`local` / `usd`) para el EERR en dos monedas; «total» para el total. */
export const columnaMoneda = (mes: string, moneda: "local" | "usd") => `${mes}|${moneda}`;

/**
 * El EERR en la moneda de la entidad y en dólares, lado a lado: para cada mes una columna en cada moneda y al final el
 * total en cada una. Los márgenes % salen de cada columna.
 */
export function filasDosMonedas(local: FilaEerr[], usd: FilaEerr[], meses: string[]): { claves: string[]; filas: FilaAF4[] } {
  const enPeriodo = new Set(meses);
  const corridas: FilaEerr[] = [];
  for (const [lista, moneda] of [
    [local, "local"],
    [usd, "usd"],
  ] as const) {
    for (const f of lista) {
      if (!enPeriodo.has(f.periodo)) continue;
      corridas.push({ ...f, periodo: columnaMoneda(f.periodo, moneda) }, { ...f, periodo: columnaMoneda("total", moneda) });
    }
  }
  const claves = [...meses.flatMap((m) => [columnaMoneda(m, "local"), columnaMoneda(m, "usd")]), columnaMoneda("total", "local"), columnaMoneda("total", "usd")];
  return { claves, filas: desdeEerr(filasEstado(armarEerr(corridas, claves)), claves) };
}
