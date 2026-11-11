// Valoración de la empresa (Panel financiero › Valoración): el valor por múltiplo de EBITDA y un DCF simple. Los
// supuestos viven en `fin_config` (clave `valoracion`, migraciones 0917 y 0919) y los cambia quien puede modificar
// Estado de resultados; si la tabla no existe se usan los de por defecto. La lectura (`cargarValoracion`) se guarda por
// petición con `cache`; el resto es lógica pura (sirve en el servidor y en las pruebas, `valoracion.test.ts`).

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MULTIPLO_EBITDA, valorEmpresa } from "./eerr";
import { tendenciaMensual } from "./presupuesto";

/** Los supuestos de la valoración. Las tasas van en % (22 = 22 %). */
export interface SupuestosValoracion {
  /** Múltiplo de EBITDA anual. */
  multiplo: number;
  /** Tasa de descuento anual del DCF (costo del capital). */
  tasaDescuento: number;
  /** Crecimiento a perpetuidad del valor terminal (Gordon). */
  crecimientoPerpetuo: number;
  /** Años de proyección explícita. */
  anios: number;
  /** Impuesto sobre la renta estimado, sobre EBITDA − capex. */
  tasaImpuesto: number;
}

export const CLAVE_VALORACION = "valoracion";

/**
 * Por defecto, para una PyME de e-commerce en Panamá (supuesto de gestión, ver la guía): 4× EBITDA; descuento 22 %
 * (tasa libre de riesgo de EE. UU. + riesgo país + prima de mercado con beta de comercio electrónico + prima por tamaño y
 * falta de liquidez); 3 % a perpetuidad (inflación en dólares más un crecimiento real moderado); 5 años; 25 % de impuesto
 * sobre la renta (tarifa general de personas jurídicas en Panamá).
 */
export const VALORACION_PREDETERMINADA: SupuestosValoracion = {
  multiplo: MULTIPLO_EBITDA,
  tasaDescuento: 22,
  crecimientoPerpetuo: 3,
  anios: 5,
  tasaImpuesto: 25,
};

/** Rango permitido de cada supuesto (y su nombre en `fin_config`). */
export const CAMPOS_VALORACION: { clave: keyof SupuestosValoracion; guardado: string; etiqueta: string; min: number; max: number; entero?: boolean }[] = [
  { clave: "multiplo", guardado: "multiplo", etiqueta: "Múltiplo de EBITDA", min: 0.5, max: 30 },
  { clave: "tasaDescuento", guardado: "tasa_descuento", etiqueta: "Tasa de descuento (%)", min: 1, max: 60 },
  { clave: "crecimientoPerpetuo", guardado: "crecimiento_perpetuo", etiqueta: "Crecimiento a perpetuidad (%)", min: -5, max: 10 },
  { clave: "anios", guardado: "años", etiqueta: "Años proyectados", min: 1, max: 10, entero: true },
  { clave: "tasaImpuesto", guardado: "tasa_impuesto", etiqueta: "Impuesto sobre la renta (%)", min: 0, max: 50 },
];

const enRango = (n: unknown, min: number, max: number, entero?: boolean): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max && (!entero || Number.isInteger(n));

/** Los supuestos guardados (jsonb de `fin_config`): cada campo fuera de rango o ausente queda por defecto. */
export function leerValoracion(v: unknown): SupuestosValoracion {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out = { ...VALORACION_PREDETERMINADA };
  for (const c of CAMPOS_VALORACION) {
    const crudo = o[c.guardado] ?? o[c.clave];
    const n = typeof crudo === "string" ? Number(crudo) : crudo;
    if (enRango(n, c.min, c.max, c.entero)) out[c.clave] = n;
  }
  return out;
}

/** Como se guarda en `fin_config.valor`. */
export function valoracionAGuardar(s: SupuestosValoracion): Record<string, number> {
  return Object.fromEntries(CAMPOS_VALORACION.map((c) => [c.guardado, s[c.clave]]));
}

/** Lo que llega del formulario; error si un campo no es número o se sale de su rango. La tasa debe superar al crecimiento. */
export function validarValoracion(leer: (campo: string) => unknown): { valoracion: SupuestosValoracion } | { error: string } {
  const out = { ...VALORACION_PREDETERMINADA };
  for (const c of CAMPOS_VALORACION) {
    const t = String(leer(c.clave) ?? "").replace(/\s/g, "").replace(",", ".");
    const n = /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
    if (!enRango(n, c.min, c.max, c.entero)) {
      return { error: `${c.etiqueta}: ${c.entero ? "un número entero" : "un número"} de ${c.min} a ${c.max}.` };
    }
    out[c.clave] = n;
  }
  if (out.tasaDescuento <= out.crecimientoPerpetuo) return { error: "La tasa de descuento tiene que ser mayor que el crecimiento a perpetuidad." };
  return { valoracion: out };
}

export interface ValoracionVigente {
  supuestos: SupuestosValoracion;
  /** false: no hay fila guardada (o falta la migración) y se usan los de por defecto. */
  guardada: boolean;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

/** Los supuestos vigentes. Sin la tabla `fin_config` (migración 0917) o sin la fila, los de por defecto. */
export const cargarValoracion = cache(async (supabase: SupabaseClient): Promise<ValoracionVigente> => {
  const { data, error } = await supabase.from("fin_config").select("valor, actualizado_en, actualizado_por").eq("clave", CLAVE_VALORACION).maybeSingle();
  if (error || !data) return { supuestos: { ...VALORACION_PREDETERMINADA }, guardada: false, actualizadoEn: null, actualizadoPor: null };
  return {
    supuestos: leerValoracion(data.valor),
    guardada: true,
    actualizadoEn: (data.actualizado_en as string | null) ?? null,
    actualizadoPor: (data.actualizado_por as string | null) ?? null,
  };
});

// ---------------------------------------------------------------------------------------------------------------------
// DCF
// ---------------------------------------------------------------------------------------------------------------------

/** El año base del DCF, de los últimos meses cerrados (anualizado). */
export interface BaseDcf {
  ingresos: number;
  ebitda: number;
  /** Altas de bienes de uso por año (promedio de los meses base × 12). */
  capex: number;
  /** Capital de trabajo operativo hoy (por cobrar + inventario − por pagar); null si no se conoce. */
  capitalTrabajo: number | null;
  /** Crecimiento de los ingresos del primer año proyectado, en %. */
  crecimientoInicial: number;
}

/** El crecimiento del año 1 se acota a este rango (%): una tendencia de pocos meses no se proyecta tal cual 5 años. */
export const CRECIMIENTO_MIN = -30;
export const CRECIMIENTO_MAX = 50;

/** Un crecimiento mensual compuesto (%) como anual (%). */
export const anualDeMensual = (mensual: number) => ((1 + mensual / 100) ** 12 - 1) * 100;

/** De dónde sale el crecimiento del año 1. */
export type FuenteCrecimiento = "presupuesto" | "tendencia" | "sin_datos";

/**
 * El crecimiento anual del año 1: la tendencia de los ingresos mensuales del presupuesto (escenario base) si hay, o la
 * de los ingresos reales de los meses base. Es la misma recta sobre el logaritmo del Presupuesto (`tendenciaMensual`).
 */
export function crecimientoInicial(ingresosPresupuesto: number[] | null, ingresosReales: number[]): { crecimiento: number; fuente: FuenteCrecimiento } {
  if (ingresosPresupuesto && ingresosPresupuesto.filter((v) => v > 0).length >= 2) {
    return { crecimiento: anualDeMensual(tendenciaMensual(ingresosPresupuesto)), fuente: "presupuesto" };
  }
  if (ingresosReales.filter((v) => v > 0).length >= 2) return { crecimiento: anualDeMensual(tendenciaMensual(ingresosReales)), fuente: "tendencia" };
  return { crecimiento: 0, fuente: "sin_datos" };
}

/** Una alta de bienes de uso (`fin_bienes_uso`). */
export interface AltaBien {
  fecha_alta: string;
  importe: number;
}

/**
 * El año base: ingresos y EBITDA de los meses dados (los últimos cerrados con datos) anualizados, y las altas de bienes
 * de uso de esos mismos meses, también anualizadas (el capex).
 */
export function anualizarBase(
  meses: string[],
  ingresos: Record<string, number>,
  ebitda: Record<string, number>,
  altas: AltaBien[],
): { ingresos: number; ebitda: number; capex: number } {
  const n = meses.length;
  if (!n) return { ingresos: 0, ebitda: 0, capex: 0 };
  const enMeses = new Set(meses.map((m) => m.slice(0, 7)));
  const suma = (o: Record<string, number>) => meses.reduce((a, m) => a + (o[m] ?? 0), 0);
  const capex = altas.filter((a) => enMeses.has(a.fecha_alta.slice(0, 7))).reduce((a, x) => a + x.importe, 0);
  return { ingresos: r2((suma(ingresos) / n) * 12), ebitda: r2((suma(ebitda) / n) * 12), capex: r2((capex / n) * 12) };
}

export interface AnioDcf {
  anio: number;
  crecimiento: number;
  ingresos: number;
  ebitda: number;
  impuestos: number;
  capex: number;
  variacionCapital: number;
  flujoLibre: number;
  /** 1 / (1 + tasa)^año. */
  factor: number;
  valorPresente: number;
}

export interface ResultadoDcf {
  /** false si no se puede calcular (sin ingresos, o tasa ≤ crecimiento perpetuo); `motivo` dice por qué. */
  valido: boolean;
  motivo: string | null;
  anios: AnioDcf[];
  sumaValorPresente: number;
  valorTerminal: number;
  valorPresenteTerminal: number;
  /** Valor de empresa por DCF; nunca negativo (como `valorEmpresa`). */
  valor: number;
  /** Parte del valor que viene del valor terminal, en %; null sin valor. */
  pesoTerminal: number | null;
  margenEbitda: number;
  capexSobreIngresos: number;
  capitalSobreIngresos: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * DCF simple: los ingresos crecen desde `crecimientoInicial` (acotado) hasta el crecimiento perpetuo en línea recta a lo
 * largo de los años proyectados; el EBITDA, el capex y el capital de trabajo mantienen su peso sobre los ingresos del
 * año base. Flujo libre = EBITDA − impuestos (tasa × (EBITDA − capex), si es positivo) − capex − aumento del capital de
 * trabajo. Valor terminal de Gordon sobre el flujo del último año; todo se descuenta a fin de año.
 */
export function calcularDcf(base: BaseDcf, s: Pick<SupuestosValoracion, "tasaDescuento" | "crecimientoPerpetuo" | "anios" | "tasaImpuesto">): ResultadoDcf {
  const vacio = (motivo: string): ResultadoDcf => ({
    valido: false,
    motivo,
    anios: [],
    sumaValorPresente: 0,
    valorTerminal: 0,
    valorPresenteTerminal: 0,
    valor: 0,
    pesoTerminal: null,
    margenEbitda: 0,
    capexSobreIngresos: 0,
    capitalSobreIngresos: 0,
  });
  if (!(base.ingresos > 0)) return vacio("Hacen falta ingresos en los meses base.");
  if (s.tasaDescuento <= s.crecimientoPerpetuo) return vacio("La tasa de descuento tiene que ser mayor que el crecimiento a perpetuidad.");
  const r = s.tasaDescuento / 100;
  const gp = s.crecimientoPerpetuo / 100;
  const n = Math.max(1, Math.round(s.anios));
  const margen = base.ebitda / base.ingresos;
  const capexPct = base.capex / base.ingresos;
  const capitalPct = (base.capitalTrabajo ?? 0) / base.ingresos;
  const g1 = Math.min(CRECIMIENTO_MAX, Math.max(CRECIMIENTO_MIN, base.crecimientoInicial)) / 100;

  const anios: AnioDcf[] = [];
  let previo = base.ingresos;
  for (let t = 1; t <= n; t++) {
    const g = n === 1 ? g1 : g1 + ((gp - g1) * (t - 1)) / (n - 1);
    const ingresos = previo * (1 + g);
    const ebitda = ingresos * margen;
    const capex = ingresos * capexPct;
    const impuestos = Math.max(ebitda - capex, 0) * (s.tasaImpuesto / 100);
    const variacionCapital = capitalPct * (ingresos - previo);
    const flujoLibre = ebitda - impuestos - capex - variacionCapital;
    const factor = 1 / (1 + r) ** t;
    anios.push({
      anio: t,
      crecimiento: g * 100,
      ingresos: r2(ingresos),
      ebitda: r2(ebitda),
      impuestos: r2(impuestos),
      capex: r2(capex),
      variacionCapital: r2(variacionCapital),
      flujoLibre: r2(flujoLibre),
      factor,
      valorPresente: r2(flujoLibre * factor),
    });
    previo = ingresos;
  }
  const ultimo = anios[anios.length - 1];
  const sumaValorPresente = r2(anios.reduce((a, x) => a + x.flujoLibre * x.factor, 0));
  const valorTerminal = r2((ultimo.flujoLibre * (1 + gp)) / (r - gp));
  const valorPresenteTerminal = r2(valorTerminal * ultimo.factor);
  const bruto = sumaValorPresente + valorPresenteTerminal;
  const valor = r2(Math.max(bruto, 0));
  return {
    valido: true,
    motivo: null,
    anios,
    sumaValorPresente,
    valorTerminal,
    valorPresenteTerminal,
    valor,
    pesoTerminal: valor > 0 ? (valorPresenteTerminal / bruto) * 100 : null,
    margenEbitda: margen * 100,
    capexSobreIngresos: capexPct * 100,
    capitalSobreIngresos: capitalPct * 100,
  };
}

/** Pasos de la matriz de sensibilidad, en puntos: tasa de descuento (filas) y crecimiento perpetuo (columnas). */
export const PASOS_TASA = [-4, -2, 0, 2, 4];
export const PASOS_CRECIMIENTO = [-2, -1, 0, 1, 2];

export interface CeldaValoracion {
  tasa: number;
  crecimiento: number;
  /** null si la tasa no supera al crecimiento (Gordon no aplica) o la tasa no es positiva. */
  valor: number | null;
}

/** Matriz 5 × 5 del valor DCF: tasa de descuento ± 2 y 4 puntos × crecimiento perpetuo ± 1 y 2 puntos. */
export function sensibilidadDcf(base: BaseDcf, s: SupuestosValoracion): CeldaValoracion[][] {
  return PASOS_TASA.map((dt) =>
    PASOS_CRECIMIENTO.map((dg) => {
      const tasa = r2(s.tasaDescuento + dt);
      const crecimiento = r2(s.crecimientoPerpetuo + dg);
      const d = tasa > 0 && tasa > crecimiento ? calcularDcf(base, { ...s, tasaDescuento: tasa, crecimientoPerpetuo: crecimiento }) : null;
      return { tasa, crecimiento, valor: d?.valido ? d.valor : null };
    }),
  );
}

export interface RangoValor {
  porMultiplo: number;
  porDcf: number | null;
  minimo: number;
  maximo: number;
  /** El menor y el mayor de la matriz de sensibilidad (null sin celdas válidas). */
  sensibilidad: { minimo: number; maximo: number } | null;
}

/** El rango de valor: entre el valor por múltiplo y el DCF, y lo que abarca la sensibilidad. */
export function rangoValor(ebitdaAnual: number, s: SupuestosValoracion, dcf: ResultadoDcf, matriz: CeldaValoracion[][]): RangoValor {
  const porMultiplo = valorEmpresa(ebitdaAnual, s.multiplo);
  const porDcf = dcf.valido ? dcf.valor : null;
  const valores = [porMultiplo, ...(porDcf === null ? [] : [porDcf])];
  const celdas = matriz.flat().map((c) => c.valor).filter((v): v is number => v !== null);
  return {
    porMultiplo,
    porDcf,
    minimo: Math.min(...valores),
    maximo: Math.max(...valores),
    sensibilidad: celdas.length ? { minimo: Math.min(...celdas), maximo: Math.max(...celdas) } : null,
  };
}

/** Múltiplo de EBITDA que implica el DCF (valor ÷ EBITDA anual); null sin EBITDA positivo. */
export const multiploImplicito = (valorDcf: number, ebitdaAnual: number) => (ebitdaAnual > 0 ? valorDcf / ebitdaAnual : null);
