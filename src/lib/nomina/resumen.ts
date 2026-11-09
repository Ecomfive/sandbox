// Indicadores de un mes de nómina (lógica pura; la página /nomina los dibuja). Prueba en `resumen.test.ts`.

import type { TipoNomina } from "./excel";

export interface LineaResumen {
  tipo: TipoNomina;
  persona_id: string;
  unidad: string;
  total_bruto: number;
  neto: number;
  seguro_social: number;
  seguro_educativo: number;
  diferencia_calculo: number;
}

export interface ResumenMes {
  /** Planilla (total asignaciones) + externa (total USDT) + comisión de Binance. */
  costoTotal: number;
  formalBruto: number;
  formalNeto: number;
  retenciones: number;
  externa: number;
  comision: number;
  personas: number;
  personasFormal: number;
  personasExterna: number;
  noCuadran: number;
  /** Costo por tienda (formal bruto + externa), de mayor a menor. A DISTRIBUIR va como tal, sin repartir. */
  porTienda: { unidad: string; monto: number; formal: number; externa: number }[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function resumirMes(lineas: LineaResumen[], comision = 0): ResumenMes {
  const formal = lineas.filter((l) => l.tipo === "formal");
  const externa = lineas.filter((l) => l.tipo === "externa");
  const suma = (ls: LineaResumen[], f: (l: LineaResumen) => number) => r2(ls.reduce((a, l) => a + f(l), 0));
  const formalBruto = suma(formal, (l) => l.total_bruto);
  const totalExterna = suma(externa, (l) => l.neto);
  const tiendas = new Map<string, { formal: number; externa: number }>();
  for (const l of lineas) {
    const t = tiendas.get(l.unidad) ?? { formal: 0, externa: 0 };
    if (l.tipo === "formal") t.formal += l.total_bruto;
    else t.externa += l.neto;
    tiendas.set(l.unidad, t);
  }
  return {
    costoTotal: r2(formalBruto + totalExterna + comision),
    formalBruto,
    formalNeto: suma(formal, (l) => l.neto),
    retenciones: suma(formal, (l) => l.seguro_social + l.seguro_educativo),
    externa: totalExterna,
    comision: r2(comision),
    personas: new Set(lineas.map((l) => l.persona_id)).size,
    personasFormal: new Set(formal.map((l) => l.persona_id)).size,
    personasExterna: new Set(externa.map((l) => l.persona_id)).size,
    noCuadran: lineas.filter((l) => l.diferencia_calculo !== 0).length,
    porTienda: [...tiendas]
      .map(([unidad, t]) => ({ unidad, formal: r2(t.formal), externa: r2(t.externa), monto: r2(t.formal + t.externa) }))
      .sort((a, b) => b.monto - a.monto),
  };
}

/** Variación porcentual; null si no hay mes anterior con costo. */
export function variacionPct(actual: number, anterior: number | null): number | null {
  if (anterior === null || anterior === 0) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
}
