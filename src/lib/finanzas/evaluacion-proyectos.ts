// Evaluación de proyectos antes de aprobarlos (Capital y riesgo › Proyectos, mejora 39, migración 0949). Lógica pura:
// flujos por período (inversión, ingresos, costos, capital de trabajo), VAN, TIR (con los casos sin cambio de signo y
// con varias TIR), payback simple y descontado, índice de rentabilidad, sensibilidad a ±20 % en ingresos y costos y el
// seguimiento real contra lo prometido. Prueba en `evaluacion-proyectos.test.ts`.

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export type Periodicidad = "mes" | "anio";
export const ETIQUETA_PERIODICIDAD: Record<Periodicidad, string> = { mes: "Mensual", anio: "Anual" };
export const esPeriodicidad = (v: unknown): v is Periodicidad => v === "mes" || v === "anio";

export const ESTADOS_PROYECTO = ["borrador", "aprobado", "rechazado"] as const;
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number];
export const ETIQUETA_ESTADO_PROYECTO: Record<EstadoProyecto, string> = { borrador: "Borrador", aprobado: "Aprobado", rechazado: "Rechazado" };
export const esEstadoProyecto = (v: unknown): v is EstadoProyecto => typeof v === "string" && (ESTADOS_PROYECTO as readonly string[]).includes(v);

/**
 * Un período del proyecto (el 0 es el de la inversión). Montos en positivo: la inversión y los costos restan, los ingresos
 * suman; el capital de trabajo es lo que se inmoviliza (positivo) o se libera (negativo) ese período.
 */
export interface PeriodoFlujo {
  inversion: number;
  ingresos: number;
  costos: number;
  capitalTrabajo: number;
}

export const flujoNeto = (p: PeriodoFlujo) => r2(p.ingresos - p.costos - p.inversion - p.capitalTrabajo);
export const flujosNetos = (ps: PeriodoFlujo[]) => ps.map(flujoNeto);

/** La tasa anual llevada a la del período (mensual: (1 + t)^(1/12) − 1). Fracciones. */
export const tasaDelPeriodo = (anual: number, p: Periodicidad) => (p === "mes" ? (1 + anual) ** (1 / 12) - 1 : anual);
/** La tasa del período llevada a anual. */
export const tasaAnual = (periodo: number, p: Periodicidad) => (p === "mes" ? (1 + periodo) ** 12 - 1 : periodo);

/** Valor actual neto con la tasa del período (fracción); el flujo 0 no se descuenta. */
export function van(flujos: number[], tasa: number): number {
  return flujos.reduce((a, f, t) => a + f / (1 + tasa) ** t, 0);
}

/** Cuántos cambios de signo tiene la serie (sin contar los ceros): con 0 no hay TIR; con más de 1 puede haber varias. */
export function cambiosDeSigno(flujos: number[]): number {
  const s = flujos.filter((f) => Math.abs(f) > 1e-9).map(Math.sign);
  let n = 0;
  for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1]) n++;
  return n;
}

export interface ResultadoTir {
  /** La TIR del período (fracción) que se informa: la única, o la más cercana a la tasa de descuento si hay varias. */
  tir: number | null;
  /** Todas las raíces encontradas entre −99 % y 1 000 % por período. */
  todas: number[];
  motivo: "ok" | "sin_cambio_de_signo" | "multiples" | "sin_raiz";
}

/**
 * La TIR por búsqueda de raíces del VAN: barre tasas entre −99 % y 1 000 % buscando cambios de signo y afina cada uno por
 * bisección. Sin cambio de signo en los flujos no hay TIR; con varias raíces (flujos que cambian de signo más de una vez)
 * se informan todas y se marca `multiples`: en ese caso manda el VAN.
 */
export function tir(flujos: number[], referencia = 0.1): ResultadoTir {
  if (cambiosDeSigno(flujos) === 0) return { tir: null, todas: [], motivo: "sin_cambio_de_signo" };
  const f = (r: number) => van(flujos, r);
  const raices: number[] = [];
  // Rejilla más fina cerca de cero, donde caen casi todas las TIR reales.
  const rejilla: number[] = [];
  for (let r = -0.99; r < 1; r += 0.0025) rejilla.push(r);
  for (let r = 1; r <= 10; r += 0.05) rejilla.push(r);
  let previa = rejilla[0];
  let vPrevio = f(previa);
  for (let k = 1; k < rejilla.length; k++) {
    const r = rejilla[k];
    const v = f(r);
    if (Math.abs(v) < 1e-9) raices.push(r);
    else if (Math.sign(v) !== Math.sign(vPrevio) && Math.abs(vPrevio) >= 1e-9) {
      let a = previa;
      let b = r;
      let fa = vPrevio;
      for (let i = 0; i < 80; i++) {
        const m = (a + b) / 2;
        const fm = f(m);
        if (Math.sign(fm) === Math.sign(fa)) {
          a = m;
          fa = fm;
        } else b = m;
      }
      raices.push((a + b) / 2);
    }
    previa = r;
    vPrevio = v;
  }
  const todas = [...new Set(raices.map((x) => Math.round(x * 1e8) / 1e8))].sort((a, b) => a - b);
  if (!todas.length) return { tir: null, todas, motivo: "sin_raiz" };
  if (todas.length === 1) return { tir: todas[0], todas, motivo: "ok" };
  const cercana = [...todas].sort((a, b) => Math.abs(a - referencia) - Math.abs(b - referencia))[0];
  return { tir: cercana, todas, motivo: "multiples" };
}

/**
 * Período en que se recupera lo invertido (con fracción lineal dentro del período). `tasa` > 0 lo hace descontado.
 * null si nunca se recupera dentro del horizonte.
 */
export function payback(flujos: number[], tasa = 0): number | null {
  let acumulado = 0;
  for (let t = 0; t < flujos.length; t++) {
    const f = flujos[t] / (1 + tasa) ** t;
    const antes = acumulado;
    acumulado += f;
    if (t > 0 && antes < 0 && acumulado >= 0) return Math.round((t - 1 + -antes / f) * 100) / 100;
    if (t === 0 && acumulado >= 0 && flujos.slice(1).every((x) => x >= 0)) return 0;
  }
  return null;
}

/** Índice de rentabilidad: valor actual de lo que entra después ÷ valor actual de lo que se invierte (salidas). */
export function indiceRentabilidad(flujos: number[], tasa: number): number | null {
  let entradas = 0;
  let salidas = 0;
  flujos.forEach((f, t) => {
    const v = f / (1 + tasa) ** t;
    if (v >= 0) entradas += v;
    else salidas -= v;
  });
  return salidas > 0 ? Math.round((entradas / salidas) * 1000) / 1000 : null;
}

export interface Evaluacion {
  flujos: number[];
  tasaPeriodo: number;
  van: number;
  tir: ResultadoTir;
  /** TIR anualizada (fracción). */
  tirAnual: number | null;
  payback: number | null;
  paybackDescontado: number | null;
  indice: number | null;
  inversionTotal: number;
  /** VAN > 0 e índice > 1. */
  conviene: boolean;
}

export function evaluar(periodos: PeriodoFlujo[], tasaAnualDescuento: number, periodicidad: Periodicidad): Evaluacion {
  const flujos = flujosNetos(periodos);
  const tasaPeriodo = tasaDelPeriodo(tasaAnualDescuento, periodicidad);
  const t = tir(flujos, tasaPeriodo);
  const v = r2(van(flujos, tasaPeriodo));
  const indice = indiceRentabilidad(flujos, tasaPeriodo);
  return {
    flujos,
    tasaPeriodo,
    van: v,
    tir: t,
    tirAnual: t.tir === null ? null : tasaAnual(t.tir, periodicidad),
    payback: payback(flujos),
    paybackDescontado: payback(flujos, tasaPeriodo),
    indice,
    inversionTotal: r2(periodos.reduce((a, p) => a + p.inversion, 0)),
    conviene: v > 0 && (indice ?? 0) > 1,
  };
}

// ---------------------------------------------------------------------------------------------
// Sensibilidad
// ---------------------------------------------------------------------------------------------
export const PASOS_SENSIBILIDAD = [-0.2, -0.1, 0, 0.1, 0.2];

export interface CeldaSensibilidad {
  ingresos: number;
  costos: number;
  van: number;
  tirAnual: number | null;
}

/** VAN y TIR con los ingresos y los costos movidos ±10 % y ±20 % (filas: ingresos; columnas: costos). */
export function sensibilidad(periodos: PeriodoFlujo[], tasaAnualDescuento: number, periodicidad: Periodicidad, pasos = PASOS_SENSIBILIDAD): CeldaSensibilidad[][] {
  return pasos.map((di) =>
    pasos.map((dc) => {
      const e = evaluar(
        periodos.map((p) => ({ ...p, ingresos: p.ingresos * (1 + di), costos: p.costos * (1 + dc) })),
        tasaAnualDescuento,
        periodicidad,
      );
      return { ingresos: di, costos: dc, van: e.van, tirAnual: e.tirAnual };
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Seguimiento real vs prometido
// ---------------------------------------------------------------------------------------------
export interface SeguimientoProyecto {
  periodos: number;
  prometido: number;
  real: number;
  /** Real − prometido acumulado en los períodos con dato real. */
  diferencia: number;
  /** Real ÷ prometido (null sin prometido). */
  cumplimiento: number | null;
  /** VAN con lo real en los períodos con dato y lo prometido en el resto. */
  vanRevisado: number;
}

export function seguimiento(prometido: PeriodoFlujo[], real: (PeriodoFlujo | null)[], tasaAnualDescuento: number, periodicidad: Periodicidad): SeguimientoProyecto | null {
  const conDato = real.map((r, i) => (r && i < prometido.length ? i : -1)).filter((i) => i >= 0);
  if (!conDato.length) return null;
  const p = conDato.reduce((a, i) => a + flujoNeto(prometido[i]), 0);
  const r = conDato.reduce((a, i) => a + flujoNeto(real[i]!), 0);
  const mezcla = prometido.map((x, i) => (real[i] ? real[i]! : x));
  return {
    periodos: conDato.length,
    prometido: r2(p),
    real: r2(r),
    diferencia: r2(r - p),
    cumplimiento: Math.abs(p) > 1e-9 ? Math.round((r / p) * 1000) / 1000 : null,
    vanRevisado: r2(van(flujosNetos(mezcla), tasaDelPeriodo(tasaAnualDescuento, periodicidad))),
  };
}

// ---------------------------------------------------------------------------------------------
// Validación de lo que llega del navegador
// ---------------------------------------------------------------------------------------------
export const MAX_PERIODOS = 60;
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[\s,]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function validarPeriodos(v: unknown, permitirNulos = false): (PeriodoFlujo | null)[] | { error: string } {
  if (!Array.isArray(v) || v.length > MAX_PERIODOS) return { error: `Hasta ${MAX_PERIODOS} períodos.` };
  const out: (PeriodoFlujo | null)[] = [];
  for (let i = 0; i < v.length; i++) {
    const p = v[i];
    if (p === null && permitirNulos) {
      out.push(null);
      continue;
    }
    if (!p || typeof p !== "object") return { error: `Período ${i}: datos inválidos.` };
    const o = p as Record<string, unknown>;
    const campos = { inversion: numero(o.inversion), ingresos: numero(o.ingresos), costos: numero(o.costos), capitalTrabajo: numero(o.capitalTrabajo) };
    for (const [k, x] of Object.entries(campos)) {
      if (x === null || Math.abs(x) >= 1e9) return { error: `Período ${i}: ${k} no es un monto válido.` };
      if (k !== "capitalTrabajo" && x < 0) return { error: `Período ${i}: los montos van en positivo (el capital de trabajo puede ser negativo).` };
    }
    out.push({ inversion: r2(campos.inversion!), ingresos: r2(campos.ingresos!), costos: r2(campos.costos!), capitalTrabajo: r2(campos.capitalTrabajo!) });
  }
  return out;
}

export interface ProyectoNuevo {
  nombre: string;
  descripcion: string | null;
  periodicidad: Periodicidad;
  /** Tasa anual en % (null = la del portal). */
  tasa: number | null;
  inicio: string | null;
  flujos: PeriodoFlujo[];
}

export function validarProyecto(v: unknown): ProyectoNuevo | { error: string } {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const nombre = typeof o.nombre === "string" ? o.nombre.trim().slice(0, 120) : "";
  if (!nombre) return { error: "Escribe el nombre del proyecto." };
  const descripcion = typeof o.descripcion === "string" && o.descripcion.trim() ? o.descripcion.trim().slice(0, 2000) : null;
  if (!esPeriodicidad(o.periodicidad)) return { error: "Elige si los períodos son meses o años." };
  let tasa: number | null = null;
  if (o.tasa !== null && o.tasa !== undefined && o.tasa !== "") {
    const t = numero(o.tasa);
    if (t === null || t <= -50 || t > 200) return { error: "La tasa de descuento va de −50 % a 200 %." };
    tasa = Math.round(t * 100) / 100;
  }
  const inicio = typeof o.inicio === "string" && /^\d{4}-\d{2}-01$/.test(o.inicio) ? o.inicio : null;
  const flujos = validarPeriodos(o.flujos);
  if ("error" in flujos) return flujos;
  if (flujos.length < 2) return { error: "Hacen falta al menos dos períodos (la inversión y un retorno)." };
  return { nombre, descripcion, periodicidad: o.periodicidad, tasa, inicio, flujos: flujos as PeriodoFlujo[] };
}

/** Lee los flujos guardados (jsonb) sin confiar en su forma. */
export function leerPeriodos(v: unknown, permitirNulos = false): (PeriodoFlujo | null)[] {
  const r = validarPeriodos(Array.isArray(v) ? v : [], permitirNulos);
  return "error" in r ? [] : r;
}

// ---------------------------------------------------------------------------------------------
// Tasa de descuento por defecto
// ---------------------------------------------------------------------------------------------
export const CLAVE_WACC = "capital_riesgo";
/** Sin WACC guardado ni costo financiero del comité: 15 % anual. */
export const WACC_PREDETERMINADO = 15;

/** La tasa de descuento que se usa: la del proyecto, si no el WACC guardado, si no el costo financiero mezclado, si no 15 %. */
export function tasaDescuento(proyecto: number | null, wacc: number | null, costoFinanciero: number | null): { tasa: number; fuente: "proyecto" | "wacc" | "costo_financiero" | "predeterminada" } {
  if (proyecto !== null) return { tasa: proyecto, fuente: "proyecto" };
  if (wacc !== null) return { tasa: wacc, fuente: "wacc" };
  if (costoFinanciero !== null && costoFinanciero > 0) return { tasa: Math.round(costoFinanciero * 100) / 100, fuente: "costo_financiero" };
  return { tasa: WACC_PREDETERMINADO, fuente: "predeterminada" };
}
