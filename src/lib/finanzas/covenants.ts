// Portal AF4 360° › Tesorería › Covenants (mejora 20 del «CFO en línea»). Lógica pura: los covenants que se pueden pactar
// con un banco (deuda / EBITDA máximo, cobertura de intereses mínima, liquidez corriente mínima, patrimonio mínimo y
// capital de trabajo mínimo), su evaluación con margen de riesgo, los insumos de cada mes (con las mismas fórmulas del
// paquete bancario: `indicadoresBancarios`, `posicionCorriente`, `interesesDeFinanzas`) y su proyección a 6 meses con la
// deuda programada (la de hoy o la de una oferta de refinanciamiento). Prueba en `covenants.test.ts`.

import type { InsumosBalance } from "./balance";
import type { Eerr } from "./eerr";
import { deudaTotalAl, intereses12, type Instrumento } from "./optimizar-deuda";
import { indicadoresBancarios, interesesDeFinanzas, posicionCorriente, type IndicadoresBancarios, type InsumosIndicadores } from "./paquete-bancario";

const r2 = (v: number) => Math.round(v * 100) / 100;

export const INDICADORES_COVENANT = [
  { clave: "deuda_ebitda_max", etiqueta: "Deuda / EBITDA máximo", corto: "Deuda / EBITDA", sentido: "max", formato: "veces" },
  { clave: "cobertura_min", etiqueta: "Cobertura de intereses mínima", corto: "Cobertura de intereses", sentido: "min", formato: "veces" },
  { clave: "liquidez_min", etiqueta: "Liquidez corriente mínima", corto: "Liquidez corriente", sentido: "min", formato: "veces" },
  { clave: "patrimonio_min", etiqueta: "Patrimonio mínimo", corto: "Patrimonio", sentido: "min", formato: "dinero" },
  { clave: "capital_trabajo_min", etiqueta: "Capital de trabajo mínimo", corto: "Capital de trabajo", sentido: "min", formato: "dinero" },
] as const;
export type IndicadorCovenant = (typeof INDICADORES_COVENANT)[number]["clave"];
export const esIndicadorCovenant = (v: unknown): v is IndicadorCovenant => typeof v === "string" && INDICADORES_COVENANT.some((i) => i.clave === v);
export const defIndicador = (c: IndicadorCovenant) => INDICADORES_COVENANT.find((i) => i.clave === c)!;

export const AMBITOS_COVENANT = [
  { clave: "general", etiqueta: "Toda la empresa" },
  { clave: "prestamo", etiqueta: "Préstamo" },
  { clave: "linea", etiqueta: "Línea de crédito" },
  { clave: "ciclo", etiqueta: "Financiamiento por ciclo" },
  { clave: "oferta", etiqueta: "Oferta de refinanciamiento" },
] as const;
export type AmbitoCovenant = (typeof AMBITOS_COVENANT)[number]["clave"];
export const esAmbitoCovenant = (v: unknown): v is AmbitoCovenant => typeof v === "string" && AMBITOS_COVENANT.some((a) => a.clave === v);

export interface Covenant {
  id: string;
  ambito: AmbitoCovenant;
  refId: string | null;
  indicador: IndicadorCovenant;
  umbral: number;
  nota: string | null;
}

/** A menos de esta distancia del umbral (10 %), «en riesgo». */
export const MARGEN_RIESGO = 0.1;
/** Meses que se proyectan. */
export const MESES_PROYECCION = 6;

/** Lo que miran los covenants de un mes. */
export interface ValoresCovenant {
  deudaEbitda: number | null;
  deudaEbitdaNoSignificativa: boolean;
  coberturaIntereses: number | null;
  /** No hay intereses: la cobertura se cumple sola. */
  sinIntereses: boolean;
  liquidezCorriente: number | null;
  capitalTrabajo: number | null;
  patrimonio: number | null;
}

export const valoresDe = (i: IndicadoresBancarios, patrimonio: number | null, intereses: number): ValoresCovenant => ({
  deudaEbitda: i.deudaEbitda,
  deudaEbitdaNoSignificativa: i.deudaEbitdaNoSignificativa,
  coberturaIntereses: i.coberturaIntereses,
  sinIntereses: !(intereses > 0),
  liquidezCorriente: i.liquidezCorriente,
  capitalTrabajo: i.capitalTrabajo,
  patrimonio,
});

export function valorIndicador(c: IndicadorCovenant, v: ValoresCovenant): number | null {
  switch (c) {
    case "deuda_ebitda_max":
      return v.deudaEbitda;
    case "cobertura_min":
      return v.coberturaIntereses;
    case "liquidez_min":
      return v.liquidezCorriente;
    case "patrimonio_min":
      return v.patrimonio;
    case "capital_trabajo_min":
      return v.capitalTrabajo;
  }
}

export type EstadoCovenant = "cumple" | "riesgo" | "incumple" | "sin_dato";
export const ETIQUETA_ESTADO: Record<EstadoCovenant, string> = { cumple: "Cumple", riesgo: "En riesgo", incumple: "Incumple", sin_dato: "Sin dato" };
export const TONO_ESTADO: Record<EstadoCovenant, "success" | "warning" | "destructive" | "neutral"> = {
  cumple: "success",
  riesgo: "warning",
  incumple: "destructive",
  sin_dato: "neutral",
};

/**
 * Cumple, en riesgo (a menos del 10 % del umbral) o incumple. Deuda / EBITDA con EBITDA cero o negativo y deuda incumple
 * (no se puede servir la deuda con lo que genera); la cobertura sin intereses se cumple.
 */
export function evaluarCovenant(indicador: IndicadorCovenant, umbral: number, v: ValoresCovenant, margen = MARGEN_RIESGO): EstadoCovenant {
  if (indicador === "deuda_ebitda_max" && v.deudaEbitdaNoSignificativa) return "incumple";
  if (indicador === "cobertura_min" && v.sinIntereses) return "cumple";
  const valor = valorIndicador(indicador, v);
  if (valor === null || !Number.isFinite(valor)) return "sin_dato";
  const holgura = Math.abs(umbral) * margen;
  if (defIndicador(indicador).sentido === "max") {
    if (valor > umbral) return "incumple";
    return valor > umbral - holgura ? "riesgo" : "cumple";
  }
  if (valor < umbral) return "incumple";
  return valor < umbral + holgura ? "riesgo" : "cumple";
}

const PESO: Record<EstadoCovenant, number> = { incumple: 3, riesgo: 2, sin_dato: 1, cumple: 0 };
/** El peor estado de una lista. */
export const peorEstado = (estados: EstadoCovenant[]): EstadoCovenant => estados.reduce<EstadoCovenant>((a, e) => (PESO[e] > PESO[a] ? e : a), "cumple");

// ---------------------------------------------------------------------------------------------
// Insumos de un mes cerrado (mismas fórmulas del paquete bancario)
// ---------------------------------------------------------------------------------------------

export interface MesCovenant {
  corte: string;
  insumos: InsumosIndicadores;
  indicadores: IndicadoresBancarios;
  patrimonio: number | null;
  /** Deuda de Tesorería al corte y lo que vence en 12 meses (para separar lo que proyecta el calendario). */
  deudaTesoreria: number;
  deudaTesoreriaCorriente: number;
  valores: ValoresCovenant;
  interesesAproximados: boolean;
}

const suma = (pm: Record<string, number> | undefined) => Object.values(pm ?? {}).reduce((a, b) => a + b, 0);

/**
 * Los insumos y los indicadores de un corte: el EERR de los 12 meses que terminan en el corte (`eerr12`, null sin datos), el
 * balance del corte y su patrimonio. Igual que el paquete bancario.
 */
export function mesCovenant(corte: string, eerr12: Eerr | null, mesesConDatos: number, balance: InsumosBalance, patrimonio: number | null): MesCovenant {
  const posicion = posicionCorriente(balance);
  const finanzas = eerr12?.secciones.find((s) => s.seccion === "finanzas")?.tipos ?? [];
  const intereses = interesesDeFinanzas(finanzas);
  const insumos: InsumosIndicadores = {
    ventas: r2(suma(eerr12?.ingresosNetos)),
    ventasAnterior: null,
    costoVentas: r2(-suma(eerr12?.secciones.find((s) => s.seccion === "costo_ventas")?.efecto)),
    margenBruto: r2(suma(eerr12?.margenBruto)),
    ebitda: r2(suma(eerr12?.ebitda)),
    intereses: intereses.monto,
    cxc: posicion.cxc,
    inventario: posicion.inventario,
    cxp: posicion.cxp,
    caja: posicion.caja,
    deudaFinanciera: posicion.deudaFinanciera,
    activoCorriente: posicion.activoCorriente,
    pasivoCorriente: posicion.pasivoCorriente,
    mesesConDatos,
  };
  const indicadores = indicadoresBancarios(insumos);
  return {
    corte,
    insumos,
    indicadores,
    patrimonio,
    deudaTesoreria: r2((balance.deuda ?? []).reduce((a, d) => a + d.saldo, 0)),
    deudaTesoreriaCorriente: r2((balance.deuda ?? []).reduce((a, d) => a + d.corriente, 0)),
    valores: valoresDe(indicadores, patrimonio, insumos.intereses),
    interesesAproximados: intereses.aproximado,
  };
}

// ---------------------------------------------------------------------------------------------
// Proyección
// ---------------------------------------------------------------------------------------------

/** Lo que cambia mes a mes en la proyección, de la deuda programada. */
export interface PasoProyeccion {
  /** Fin del mes proyectado. */
  fecha: string;
  /** Deuda de Tesorería (calendario) a esa fecha y lo que vence en 12 meses. */
  deuda: number;
  deudaCorriente: number;
  /** Intereses de los 12 meses siguientes a esa fecha con el calendario del escenario. */
  interesesAdelante: number;
  /** Caja extra acumulada del escenario (lo que entra de una oferta, lo que se ahorra en cuotas). */
  cajaExtra: number;
  /** Lo que el escenario suma al patrimonio (intereses ahorrados menos costos únicos), acumulado. */
  patrimonioExtra: number;
}

export interface Tendencias {
  /** Cambio promedio por mes en los cortes cerrados. */
  patrimonio: number;
  activoCorriente: number;
  /** Pasivo corriente sin la deuda de Tesorería. */
  pasivoSinDeuda: number;
}

/** El cambio promedio por mes entre el primer y el último corte (0 con un solo corte o sin dato). */
export function tendencias(meses: MesCovenant[]): Tendencias {
  const conDato = meses.filter((m) => m.insumos.activoCorriente !== null && m.insumos.pasivoCorriente !== null);
  const pend = (f: (m: MesCovenant) => number | null) => {
    const vals = meses.map((m) => ({ v: f(m) })).filter((x): x is { v: number } => x.v !== null);
    return vals.length >= 2 ? (vals[vals.length - 1].v - vals[0].v) / (vals.length - 1) : 0;
  };
  return {
    patrimonio: r2(pend((m) => m.patrimonio)),
    activoCorriente: conDato.length >= 2 ? r2(pend((m) => m.insumos.activoCorriente)) : 0,
    pasivoSinDeuda: conDato.length >= 2 ? r2(pend((m) => (m.insumos.pasivoCorriente === null ? null : m.insumos.pasivoCorriente - m.deudaTesoreriaCorriente))) : 0,
  };
}

/**
 * Los indicadores proyectados: parte del último corte cerrado y, mes a mes, el EBITDA de 12 meses queda igual, el activo
 * corriente, el patrimonio y el pasivo corriente sin deuda siguen su tendencia de los últimos meses, la deuda de Tesorería
 * sigue su calendario y los intereses = los del último corte + (intereses de 12 meses del escenario − los de hoy).
 */
export function proyectarCovenants(base: MesCovenant, t: Tendencias, pasos: PasoProyeccion[], interesesHoy: number): { fecha: string; insumos: InsumosIndicadores; indicadores: IndicadoresBancarios; valores: ValoresCovenant; patrimonio: number | null }[] {
  const i0 = base.insumos;
  const deudaManual = r2(i0.deudaFinanciera - base.deudaTesoreria);
  const pasivoSinDeuda0 = i0.pasivoCorriente === null ? null : i0.pasivoCorriente - base.deudaTesoreriaCorriente;
  return pasos.map((p, k) => {
    const n = k + 1;
    const intereses = Math.max(r2(i0.intereses + p.interesesAdelante - interesesHoy), 0);
    const activoCorriente = i0.activoCorriente === null ? null : r2(i0.activoCorriente + t.activoCorriente * n + p.cajaExtra);
    const pasivoCorriente = pasivoSinDeuda0 === null ? null : r2(Math.max(pasivoSinDeuda0 + t.pasivoSinDeuda * n, 0) + p.deudaCorriente);
    const insumos: InsumosIndicadores = { ...i0, intereses, caja: r2(i0.caja + p.cajaExtra), deudaFinanciera: r2(deudaManual + p.deuda), activoCorriente, pasivoCorriente };
    const indicadores = indicadoresBancarios(insumos);
    const patrimonio = base.patrimonio === null ? null : r2(base.patrimonio + t.patrimonio * n + p.patrimonioExtra);
    return { fecha: p.fecha, insumos, indicadores, valores: valoresDe(indicadores, patrimonio, intereses), patrimonio };
  });
}

/** El primer mes proyectado en que un covenant incumple (null si no incumple en la ventana). */
export function primerIncumplimiento(c: Pick<Covenant, "indicador" | "umbral">, serie: { fecha: string; valores: ValoresCovenant }[]): string | null {
  return serie.find((m) => evaluarCovenant(c.indicador, c.umbral, m.valores) === "incumple")?.fecha ?? null;
}

/** Lee un umbral («3,5», «3.5x», «25000»). */
export function leerUmbral(v: unknown): number | null {
  const s = String(v ?? "").replace(/[x×$\s]/gi, "").replace(/,/g, ".");
  if (!s) return null;
  // Solo un separador decimal: «25.000.50» no es un número.
  if ((s.match(/\./g) ?? []).length > 1) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? n : null;
}

const finMes = (f: string) => new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)), 0)).toISOString().slice(0, 10);
const masMeses = (periodo: string, k: number) => {
  const t = Number(periodo.slice(0, 4)) * 12 + Number(periodo.slice(5, 7)) - 1 + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
};

/** Los fines de mes que se proyectan después del corte («AAAA-MM-01»). */
export const fechasProyeccion = (corte: string, n = MESES_PROYECCION) => Array.from({ length: n }, (_, k) => finMes(masMeses(corte, k + 1)));

/**
 * Los pasos de la proyección con la deuda de un escenario (la de hoy, la de después de prepagar o la de una oferta). `extra`
 * da, para cada fecha, la caja y el patrimonio que el escenario agrega (0 en el de hoy).
 */
export function pasosProyeccion(
  corte: string,
  escenario: Instrumento[],
  extra: (fecha: string) => { caja: number; patrimonio: number } = () => ({ caja: 0, patrimonio: 0 }),
  n = MESES_PROYECCION,
): PasoProyeccion[] {
  return fechasProyeccion(corte, n).map((fecha) => {
    const d = deudaTotalAl(escenario, fecha);
    const e = extra(fecha);
    return {
      fecha,
      deuda: d.saldo,
      deudaCorriente: d.corriente,
      interesesAdelante: r2(escenario.reduce((a, i) => a + intereses12(i, fecha), 0)),
      cajaExtra: r2(e.caja),
      patrimonioExtra: r2(e.patrimonio),
    };
  });
}
