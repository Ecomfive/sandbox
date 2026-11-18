// Alertas de desvíos (mejoras 4 y 81 de la lista de Alex, 16 nov 2026). Parte pura, con prueba en `desvios.test.ts`:
//
// · Presupuesto contra real: por sección del EERR, el último mes cerrado. Un gasto que se pasa más del 10 % de lo
//   presupuestado o unos ingresos que quedan más del 10 % por debajo dejan una alerta (`presupuesto_desvio`).
// · Gastos fuera de lo normal: por tipo de gasto, el último mes contra el promedio de los 6 anteriores. Si sube 50 % o
//   más (y la diferencia pesa), deja una alerta (`gasto_anomalo`). Así salta un cobro repetido o un gasto que nadie esperaba.
//
// Montos «como se leen en el EERR»: ingresos en positivo y cada sección de gasto en positivo (lo gastado).

import { SECCIONES, type Seccion } from "./eerr";

/** % de desvío desde el que se avisa. */
export const DESVIO_AVISO = 10;
/** % de desvío desde el que la alerta es crítica. */
export const DESVIO_CRITICO = 25;
/** Diferencia mínima en dólares para avisar (un 10 % de US$80 no es un problema). */
export const DIFERENCIA_MINIMA = 100;

/** Un tipo de gasto es «fuera de lo normal» si sube este % sobre su promedio… */
export const ANOMALIA_PCT = 50;
/** …la diferencia es al menos esto en dólares… */
export const ANOMALIA_MINIMA = 200;
/** …y tiene al menos estos meses de historia (sin historia no hay «normal»). */
export const ANOMALIA_MESES_MIN = 3;
/** Meses de historia que se promedian. */
export const ANOMALIA_VENTANA = 6;
/** Tope de alertas de gastos fuera de lo normal por corrida (las más grandes primero). */
export const MAX_ANOMALIAS = 15;

const SECCIONES_GASTO: Seccion[] = ["costo_ventas", "administracion", "marketing", "finanzas", "otros"];
const etiqueta = (s: Seccion) => SECCIONES.find((x) => x.clave === s)?.etiqueta ?? s;
const r2 = (v: number) => Math.round(v * 100) / 100;

export interface DesvioPresupuesto {
  clave: string;
  seccion: Seccion;
  etiqueta: string;
  real: number;
  presupuesto: number;
  /** % de desvío en el sentido malo (siempre positivo). */
  desvio: number;
  severidad: "aviso" | "critica";
}

/**
 * Las secciones del mes que se desvían en el sentido malo. `real` y `presupuesto` van por sección para ese mes.
 * Sin presupuesto en una sección (0) no se evalúa: no hay contra qué medir.
 */
export function desviosPresupuesto(periodo: string, real: Partial<Record<Seccion, number>>, presupuesto: Partial<Record<Seccion, number>>): DesvioPresupuesto[] {
  const salida: DesvioPresupuesto[] = [];
  for (const seccion of ["ingresos", ...SECCIONES_GASTO] as Seccion[]) {
    const p = presupuesto[seccion] ?? 0;
    const r = real[seccion] ?? 0;
    if (p <= 0) continue;
    // Ingresos: malo es quedar por debajo. Gastos: malo es pasarse.
    const diferencia = seccion === "ingresos" ? p - r : r - p;
    if (diferencia < DIFERENCIA_MINIMA) continue;
    const desvio = (100 * diferencia) / p;
    if (desvio < DESVIO_AVISO) continue;
    salida.push({
      clave: `presupuesto:${periodo.slice(0, 7)}:${seccion}`,
      seccion,
      etiqueta: etiqueta(seccion),
      real: r2(r),
      presupuesto: r2(p),
      desvio: Math.round(desvio * 10) / 10,
      severidad: desvio >= DESVIO_CRITICO ? "critica" : "aviso",
    });
  }
  return salida;
}

export interface GastoAnomalo {
  clave: string;
  tipoId: string;
  tipo: string;
  real: number;
  promedio: number;
  /** % sobre el promedio. */
  sube: number;
}

/**
 * Los tipos de gasto del mes que suben fuera de lo normal. `porTipo` trae, por tipo, lo gastado en cada mes
 * (`{ "2026-10-01": 1200, … }`); los meses sin gasto no cuentan para el promedio (un gasto trimestral no se diluye).
 */
export function gastosAnomalos(
  periodo: string,
  porTipo: Map<string, { nombre: string; seccion: Seccion; meses: Record<string, number> }>,
): GastoAnomalo[] {
  const salida: GastoAnomalo[] = [];
  const anteriores = mesesAntes(periodo, ANOMALIA_VENTANA);
  for (const [tipoId, t] of porTipo) {
    if (!SECCIONES_GASTO.includes(t.seccion) || t.seccion === "costo_ventas") continue;
    const real = t.meses[periodo] ?? 0;
    if (real <= 0) continue;
    const historia = anteriores.map((m) => t.meses[m] ?? 0).filter((v) => v > 0);
    if (historia.length < ANOMALIA_MESES_MIN) continue;
    const promedio = historia.reduce((a, v) => a + v, 0) / historia.length;
    const diferencia = real - promedio;
    if (diferencia < ANOMALIA_MINIMA || promedio <= 0) continue;
    const sube = (100 * diferencia) / promedio;
    if (sube < ANOMALIA_PCT) continue;
    salida.push({ clave: `anomalia:${periodo.slice(0, 7)}:${tipoId}`, tipoId, tipo: t.nombre, real: r2(real), promedio: r2(promedio), sube: Math.round(sube) });
  }
  return salida.sort((a, b) => b.real - b.promedio - (a.real - a.promedio)).slice(0, MAX_ANOMALIAS);
}

/** Los `n` meses anteriores a `periodo` (primer día de cada mes), del más cercano al más lejano. */
export function mesesAntes(periodo: string, n: number): string[] {
  const salida: string[] = [];
  let a = Number(periodo.slice(0, 4));
  let m = Number(periodo.slice(5, 7));
  for (let i = 0; i < n; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      a -= 1;
    }
    salida.push(`${a}-${String(m).padStart(2, "0")}-01`);
  }
  return salida;
}
