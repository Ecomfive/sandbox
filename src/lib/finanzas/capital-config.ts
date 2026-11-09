// Supuestos de Capital y riesgo (`fin_config.capital_riesgo`): el WACC para evaluar proyectos (null = el costo financiero
// mezclado del comité) y los supuestos de la asignación de capital. Lógica pura; prueba en `capital-config.test.ts`.

import { LIMITES_ASIGNACION, leerSupuestosAsignacion, type SupuestosAsignacion } from "./asignacion-capital";
import { CLAVE_WACC } from "./evaluacion-proyectos";

export const CLAVE_CAPITAL = CLAVE_WACC;

export interface ConfigCapital {
  /** WACC anual en % (null = el costo financiero del comité, o 15 %). */
  wacc: number | null;
  asignacion: SupuestosAsignacion;
}

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function leerConfigCapital(v: unknown): ConfigCapital {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const w = numero(o.wacc);
  return { wacc: w !== null && w > 0 && w <= 100 ? w : null, asignacion: leerSupuestosAsignacion(o.asignacion) };
}

export const configCapitalAGuardar = (c: ConfigCapital) => ({
  wacc: c.wacc,
  asignacion: { elasticidad: c.asignacion.elasticidad, piso_pct: c.asignacion.pisoPct, dias_inventario: c.asignacion.diasInventario },
});

/** Valida lo que manda el formulario: `wacc` vacío = usar el costo financiero. */
export function validarConfigCapital(leer: (campo: string) => unknown, actual: ConfigCapital): { config: ConfigCapital } | { error: string } {
  const out: ConfigCapital = { wacc: actual.wacc, asignacion: { ...actual.asignacion } };
  const w = leer("wacc");
  if (w !== undefined) {
    if (w === null || (typeof w === "string" && !w.trim())) out.wacc = null;
    else {
      const n = numero(w);
      if (n === null || n <= 0 || n > 100) return { error: "WACC: de 0 a 100 %." };
      out.wacc = Math.round(n * 100) / 100;
    }
  }
  for (const k of ["elasticidad", "pisoPct", "diasInventario"] as const) {
    const x = leer(k);
    if (x === undefined) continue;
    const n = numero(x);
    const l = LIMITES_ASIGNACION[k];
    if (n === null || n < l.min || n > l.max) return { error: `${l.etiqueta}: de ${l.min} a ${l.max}.` };
    out.asignacion[k] = k === "elasticidad" ? Math.round(n * 100) / 100 : Math.round(n);
  }
  return { config: out };
}
