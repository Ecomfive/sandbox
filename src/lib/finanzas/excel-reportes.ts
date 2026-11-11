// Las planillas con fórmulas del Estado de resultados y del Flujo de caja (mejora 93), a partir de las mismas filas que
// muestran sus páginas (`filasEstado`, `filasEstadoFlujo`, `filasPorCuenta`). Cada fórmula se comprueba contra el valor
// del portal (`celdasPlanilla`), así que una regla que no aplica a un caso deja el valor. Prueba en
// `excel-formulas.test.ts`.

import type { Fila } from "./eerr-filas";
import type { FilaEstadoFlujo } from "./flujo";
import type { FilaPlanilla } from "./excel-formulas";

/** Las secciones del EERR que forman cada resultado (las de costo, restando). */
const RESULTADO_EERR: Record<string, { base?: string; resta: string[]; suma?: string[] }> = {
  "ingresos-netos": { suma: ["ingresos"], resta: [] },
  "margen-bruto": { base: "ingresos-netos", resta: ["costo_ventas"] },
  ebitda: { base: "margen-bruto", resta: ["administracion", "marketing"] },
  ebit: { base: "ebitda", resta: ["depreciacion"] },
};
const PORCENTAJE_EERR: Record<string, string> = {
  "margen-bruto-pct": "margen-bruto",
  "ebitda-pct": "ebitda",
  "resultado-neto-pct": "resultado-neto",
};

const valoresDe = (pm: Record<string, number>, meses: string[]) => meses.map((m) => pm[m] ?? 0);

/** El EERR como planilla: secciones = SUM del detalle, resultados = suma con signo de secciones, márgenes = cociente. */
export function planillaEerr(filas: Fila[], meses: string[]): FilaPlanilla[] {
  const claves = new Set(filas.map((f) => f.clave));
  const secciones = filas.filter((f) => f.tipo === "seccion").map((f) => f.clave);
  return filas.map((f): FilaPlanilla => {
    if (f.tipo === "porcentaje") {
      const num = PORCENTAJE_EERR[f.clave];
      return {
        clave: f.clave,
        etiqueta: f.etiqueta,
        peso: "porcentaje",
        valores: meses.map((m) => {
          const b = f.base?.[m] ?? 0;
          return b ? (f.valores[m] ?? 0) / b : null;
        }),
        ...(num && claves.has(num) && claves.has("ingresos-netos") ? { cociente: { numerador: num, denominador: "ingresos-netos" } } : {}),
      };
    }
    if (f.tipo === "seccion") return { clave: f.clave, etiqueta: f.etiqueta, peso: "seccion", valores: valoresDe(f.valores, meses), sumaDetalle: true };
    if (f.tipo === "resultado") {
      let suma: { clave: string; signo: 1 | -1 }[] | undefined;
      const def = RESULTADO_EERR[f.clave];
      if (f.clave === "resultado-neto") {
        suma = secciones.map((s) => ({ clave: s, signo: s === "ingresos" ? 1 : -1 }));
      } else if (def) {
        const partes: { clave: string; signo: 1 | -1 }[] = [];
        if (def.base && claves.has(def.base)) partes.push({ clave: def.base, signo: 1 });
        for (const s of def.suma ?? []) if (claves.has(s)) partes.push({ clave: s, signo: 1 });
        for (const s of def.resta) if (claves.has(s)) partes.push({ clave: s, signo: -1 });
        suma = partes.length ? partes : undefined;
      }
      return { clave: f.clave, etiqueta: f.etiqueta, peso: "resultado", valores: valoresDe(f.valores, meses), ...(suma ? { suma } : {}) };
    }
    return { clave: f.clave, etiqueta: f.etiqueta, peso: "detalle", valores: valoresDe(f.valores, meses) };
  });
}

/** El estado de flujo como planilla: bloques = entradas − salidas, flujo neto = suma de bloques, caja = arrastre. */
export function planillaFlujo(filas: FilaEstadoFlujo[], meses: string[]): FilaPlanilla[] {
  const claves = new Set(filas.map((f) => f.clave));
  const bloques = filas.filter((f) => f.tipo === "seccion").map((f) => f.clave);
  return filas.map((f): FilaPlanilla => {
    const base = { clave: f.clave, etiqueta: f.etiqueta, valores: valoresDe(f.valores, meses), ...(f.total !== undefined ? { total: f.total } : {}) };
    if (f.clave === "caja-inicial") return { ...base, peso: "resultado", arrastre: "caja-final", saldo: "primero" };
    if (f.clave === "caja-final") {
      const suma = ["caja-inicial", "neto", "diferencia-cambio"].filter((c) => claves.has(c)).map((c) => ({ clave: c, signo: 1 as const }));
      return { ...base, peso: "resultado", suma, saldo: "ultimo" };
    }
    if (f.clave === "neto") return { ...base, peso: "resultado", suma: bloques.map((b) => ({ clave: b, signo: 1 as const })) };
    if (f.tipo === "seccion") return { ...base, peso: "seccion", sumaDetalle: true };
    if (f.tipo === "detalle") return { ...base, peso: "detalle", signoEnSeccion: /-salida-/.test(f.clave) ? -1 : 1 };
    return { ...base, peso: "resultado" };
  });
}

/** El flujo por cuenta: el saldo final de cada cuenta = SUM de su detalle; el saldo inicial = el final del mes anterior. */
export function planillaPorCuenta(filas: FilaEstadoFlujo[], meses: string[]): FilaPlanilla[] {
  return filas.map((f): FilaPlanilla => {
    const base = { clave: f.clave, etiqueta: f.etiqueta, valores: valoresDe(f.valores, meses), ...(f.total !== undefined ? { total: f.total } : {}) };
    if (f.clave.endsWith("-final")) return { ...base, peso: "seccion", sumaDetalle: true, saldo: "ultimo" };
    if (f.clave.endsWith("-inicial")) return { ...base, peso: "detalle", arrastre: f.clave.replace(/-inicial$/, "-final"), saldo: "primero" };
    return { ...base, peso: "detalle" };
  });
}
