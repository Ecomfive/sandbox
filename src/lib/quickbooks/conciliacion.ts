// Conciliación del portal contra QuickBooks Online (Fase 2: desviación < 1 % en cada mes cerrado). Lógica pura: a qué
// sección del Estado de resultados del portal va cada cuenta de QuickBooks (sugerida por grupo y nombre, editable), el
// Estado de resultados de QuickBooks armado con ese mapeo y la comparación mes a mes (ventas netas, costo de ventas, gastos
// por sección y EBITDA) con su desviación y su semáforo, más la lista de diferencias. Prueba en `conciliacion.test.ts`.

import { normalizar } from "../finanzas/clasificacion";
import type { Eerr, Seccion } from "../finanzas/eerr";
import type { GrupoPyg } from "./reportes";

export type Destino = Seccion | "ignorar";

export const DESTINOS: { clave: Destino; etiqueta: string }[] = [
  { clave: "ingresos", etiqueta: "Ingresos" },
  { clave: "costo_ventas", etiqueta: "Costo de ventas" },
  { clave: "administracion", etiqueta: "Administración / operación" },
  { clave: "marketing", etiqueta: "Marketing" },
  { clave: "depreciacion", etiqueta: "Depreciación" },
  { clave: "finanzas", etiqueta: "Finanzas" },
  { clave: "otros", etiqueta: "Otros" },
  { clave: "impuesto_ganancias", etiqueta: "Impuesto a las ganancias" },
  { clave: "ignorar", etiqueta: "No comparar" },
];

export const esDestino = (v: unknown): v is Destino => typeof v === "string" && DESTINOS.some((d) => d.clave === v);

/** Desviación máxima (en %) para que un mes cuadre. */
export const TOLERANCIA_PCT = 1;
/** Hasta aquí se pide revisar; más, en rojo. */
export const AVISO_PCT = 5;

const ES_INGRESO = (g: GrupoPyg) => g === "Income" || g === "OtherIncome";

/** La sección sugerida para una cuenta de QuickBooks por el grupo del reporte y el nombre. */
export function sugerirDestino(grupo: GrupoPyg, nombre: string): Destino {
  const n = normalizar(nombre);
  if (grupo === "Income") return "ingresos";
  if (grupo === "OtherIncome") return "otros";
  if (grupo === "COGS") return "costo_ventas";
  if (/DEPRECIA|AMORTIZA/.test(n)) return "depreciacion";
  if (/IMPUESTO SOBRE LA RENTA|\bISR\b|IMPUESTO A LAS GANANCIAS|INCOME TAX/.test(n)) return "impuesto_ganancias";
  if (/INTERES|FINANCI|COMISION(ES)? BANCARIA|CARGOS? BANCARIO|BANK (FEE|CHARGE)|PRESTAMO/.test(n)) return "finanzas";
  if (grupo === "OtherExpense") return "otros";
  if (/PUBLICIDAD|MARKETING|MERCADEO|\bMETA\b|FACEBOOK|INSTAGRAM|GOOGLE|TIKTOK|PAUTA|ANUNCIO|INFLUENC|ADVERTIS/.test(n)) return "marketing";
  return "administracion";
}

export interface FilaQbo {
  periodo: string;
  cuentaId: string;
  cuentaNombre: string;
  grupo: GrupoPyg;
  monto: number;
}

export interface CuentaMapeada {
  cuentaId: string;
  cuentaNombre: string;
  grupo: GrupoPyg;
  destino: Destino;
  /** Sin fila en `qbo_mapeo`: es la sugerencia. */
  sugerido: boolean;
  total: number;
}

/** Las cuentas que aparecen en el reporte con su destino (el guardado o el sugerido) y su total en la ventana. */
export function cuentasMapeadas(filas: FilaQbo[], mapeo: Map<string, Destino>): CuentaMapeada[] {
  const m = new Map<string, CuentaMapeada>();
  for (const f of filas) {
    const x = m.get(f.cuentaId) ?? {
      cuentaId: f.cuentaId,
      cuentaNombre: f.cuentaNombre,
      grupo: f.grupo,
      destino: mapeo.get(f.cuentaId) ?? sugerirDestino(f.grupo, f.cuentaNombre),
      sugerido: !mapeo.has(f.cuentaId),
      total: 0,
    };
    x.total = Math.round((x.total + f.monto) * 100) / 100;
    m.set(f.cuentaId, x);
  }
  const orden: Record<GrupoPyg, number> = { Income: 0, COGS: 1, Expense: 2, OtherIncome: 3, OtherExpense: 4 };
  return [...m.values()].sort((a, b) => orden[a.grupo] - orden[b.grupo] || a.cuentaNombre.localeCompare(b.cuentaNombre));
}

/** Efecto en el resultado por sección y mes (ingresos +, costos y gastos −), como `BloqueSeccion.efecto` del portal. */
export function efectoQbo(filas: FilaQbo[], mapeo: Map<string, Destino>, meses: string[]): Record<Seccion, Record<string, number>> {
  const secciones: Seccion[] = ["ingresos", "costo_ventas", "administracion", "marketing", "depreciacion", "finanzas", "otros", "impuesto_ganancias"];
  const salida = Object.fromEntries(secciones.map((s) => [s, Object.fromEntries(meses.map((m) => [m, 0]))])) as Record<Seccion, Record<string, number>>;
  const enVentana = new Set(meses);
  for (const f of filas) {
    if (!enVentana.has(f.periodo)) continue;
    const d = mapeo.get(f.cuentaId) ?? sugerirDestino(f.grupo, f.cuentaNombre);
    if (d === "ignorar") continue;
    salida[d][f.periodo] += ES_INGRESO(f.grupo) ? f.monto : -f.monto;
  }
  return salida;
}

export type ClaveConcepto = "ventas" | "costo_ventas" | "administracion" | "marketing" | "ebitda" | "resultado_neto";

export const CONCEPTOS: { clave: ClaveConcepto; etiqueta: string; total?: boolean }[] = [
  { clave: "ventas", etiqueta: "Ventas netas" },
  { clave: "costo_ventas", etiqueta: "Costo de ventas" },
  { clave: "administracion", etiqueta: "Gastos de administración" },
  { clave: "marketing", etiqueta: "Gastos de marketing" },
  { clave: "ebitda", etiqueta: "EBITDA", total: true },
  { clave: "resultado_neto", etiqueta: "Resultado neto", total: true },
];

export type Semaforo = "verde" | "ambar" | "rojo" | "sin_datos";

/** Desviación del portal contra QuickBooks, en % de QuickBooks (null si QuickBooks es 0 y el portal no). */
export function desviacionPct(portal: number, qbo: number): number | null {
  if (Math.abs(qbo) < 0.005) return Math.abs(portal) < 0.005 ? 0 : null;
  return ((portal - qbo) / Math.abs(qbo)) * 100;
}

export function semaforoDesviacion(d: number | null, hayQbo: boolean): Semaforo {
  if (!hayQbo) return "sin_datos";
  if (d === null) return "rojo";
  const a = Math.abs(d);
  return a < TOLERANCIA_PCT ? "verde" : a < AVISO_PCT ? "ambar" : "rojo";
}

export interface Comparacion {
  concepto: ClaveConcepto;
  etiqueta: string;
  periodo: string;
  portal: number;
  qbo: number;
  diferencia: number;
  desviacion: number | null;
  semaforo: Semaforo;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Compara el EERR del portal con el de QuickBooks por mes. Costos y gastos se muestran positivos (como se leen); EBITDA y
 * resultado neto con su signo. `mesesConQbo` = los meses que QuickBooks ya tiene leídos (sin ellos, «sin datos»).
 */
export function compararMeses(portal: Eerr, filas: FilaQbo[], mapeo: Map<string, Destino>, mesesConQbo: Set<string>): Comparacion[] {
  const meses = portal.meses;
  const q = efectoQbo(filas, mapeo, meses);
  const efP = (s: Seccion) => portal.secciones.find((x) => x.seccion === s)?.efecto ?? {};
  const salida: Comparacion[] = [];
  for (const m of meses) {
    const qEbitda = q.ingresos[m] + q.costo_ventas[m] + q.administracion[m] + q.marketing[m];
    const qNeto = Object.values(q).reduce((a, s) => a + s[m], 0);
    const valores: Record<ClaveConcepto, [number, number]> = {
      ventas: [portal.ingresosNetos[m] ?? 0, q.ingresos[m]],
      costo_ventas: [-(efP("costo_ventas")[m] ?? 0), -q.costo_ventas[m]],
      administracion: [-(efP("administracion")[m] ?? 0), -q.administracion[m]],
      marketing: [-(efP("marketing")[m] ?? 0), -q.marketing[m]],
      ebitda: [portal.ebitda[m] ?? 0, qEbitda],
      resultado_neto: [portal.resultadoNeto[m] ?? 0, qNeto],
    };
    for (const c of CONCEPTOS) {
      const [p, qb] = valores[c.clave].map(r2);
      const d = desviacionPct(p, qb);
      salida.push({ concepto: c.clave, etiqueta: c.etiqueta, periodo: m, portal: p, qbo: qb, diferencia: r2(p - qb), desviacion: d, semaforo: semaforoDesviacion(d, mesesConQbo.has(m)) });
    }
  }
  return salida;
}

/** Las diferencias que no cuadran (fuera de la tolerancia), de la mayor a la menor. */
export function diferencias(comparaciones: Comparacion[], meses?: Set<string>): Comparacion[] {
  return comparaciones
    .filter((c) => (c.semaforo === "ambar" || c.semaforo === "rojo") && (!meses || meses.has(c.periodo)))
    .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
}

/** El resultado de las ventas de un mes, para el checklist del cierre y el comité. */
export function cuadreVentasQbo(portal: number, qbo: number | null): { desviacion: number | null; cuadra: boolean } | null {
  if (qbo === null) return null;
  const d = desviacionPct(portal, qbo);
  return { desviacion: d, cuadra: d !== null && Math.abs(d) < TOLERANCIA_PCT };
}
