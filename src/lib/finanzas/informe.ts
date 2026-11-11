// Informe mensual ejecutivo (formato AF4: desempeño, causas, implicancias y acciones). Lógica pura sobre el EERR ya
// armado (`armarEerr`): sirve en el servidor, en «Copiar informe» y en las pruebas (`informe.test.ts`).

import { dinero } from "@/lib/af4/formato";
import { MULTIPLO_EBITDA, SECCIONES, sobre, valorEmpresa, variacion, type Eerr, type Seccion } from "./eerr";
import {
  SIGNO_SECCION,
  compararConReal,
  detalleDeLineas,
  esDividendo,
  redondear,
  serieDeEerr,
  serieDeLineas,
  tieneTipos,
  valorEnSeccion,
  type FilaComparacion,
} from "./presupuesto";

export interface CifrasMes {
  ingresos: number;
  margenBruto: number;
  ebitda: number;
  resultadoNeto: number;
  margenBrutoPct: number | null;
  margenEbitdaPct: number | null;
  /** Peso de cada sección de gasto sobre los ingresos, en %. */
  costoVentasPct: number | null;
  marketingPct: number | null;
  administracionPct: number | null;
}

const efecto = (eerr: Eerr, s: Seccion, mes: string) => eerr.secciones.find((x) => x.seccion === s)?.efecto[mes] ?? 0;

export function cifrasDelMes(eerr: Eerr, mes: string): CifrasMes {
  const ingresos = eerr.ingresosNetos[mes] ?? 0;
  const margenBruto = eerr.margenBruto[mes] ?? 0;
  const ebitda = eerr.ebitda[mes] ?? 0;
  return {
    ingresos,
    margenBruto,
    ebitda,
    resultadoNeto: eerr.resultadoNeto[mes] ?? 0,
    margenBrutoPct: sobre(margenBruto, ingresos),
    margenEbitdaPct: sobre(ebitda, ingresos),
    costoVentasPct: sobre(-efecto(eerr, "costo_ventas", mes), ingresos),
    marketingPct: sobre(-efecto(eerr, "marketing", mes), ingresos),
    administracionPct: sobre(-efecto(eerr, "administracion", mes), ingresos),
  };
}

export interface Causa {
  seccion: Seccion;
  etiqueta: string;
  tipo: string;
  actual: number;
  anterior: number;
  /** Cuánto movió el resultado contra el mes anterior: positivo mejora, negativo empeora. */
  impacto: number;
}

/** Las líneas del EERR que más movieron el resultado de un mes al otro (por su efecto, no por su monto). */
export function causasPrincipales(eerr: Eerr, mes: string, anterior: string, cuantas = 6): Causa[] {
  const causas: Causa[] = [];
  for (const s of eerr.secciones) {
    for (const t of s.tipos) {
      const a = t.meses[mes] ?? 0;
      const b = t.meses[anterior] ?? 0;
      const impacto = (a - b) * t.signo;
      if (Math.abs(impacto) >= 0.5) causas.push({ seccion: s.seccion, etiqueta: s.etiqueta, tipo: t.tipo, actual: a, anterior: b, impacto });
    }
  }
  return causas.sort((x, y) => Math.abs(y.impacto) - Math.abs(x.impacto)).slice(0, cuantas);
}

export interface TiendaMes {
  nombre: string;
  ingresos: number;
  ebitda: number;
  ebitdaAnterior: number;
  margenEbitdaPct: number | null;
}

export function tiendaDelMes(nombre: string, eerr: Eerr, mes: string, anterior: string): TiendaMes {
  const ingresos = eerr.ingresosNetos[mes] ?? 0;
  const ebitda = eerr.ebitda[mes] ?? 0;
  return { nombre, ingresos, ebitda, ebitdaAnterior: eerr.ebitda[anterior] ?? 0, margenEbitdaPct: sobre(ebitda, ingresos) };
}

export interface Implicancias {
  /** EBITDA del mes × 12. */
  ebitdaAnualMes: number;
  valorEmpresaMes: number;
  /** Contra el valor implícito del mes anterior. */
  valorCreado: number;
}

export function implicancias(actual: CifrasMes, anterior: CifrasMes, multiplo = MULTIPLO_EBITDA): Implicancias {
  const ebitdaAnualMes = actual.ebitda * 12;
  const valorEmpresaMes = valorEmpresa(ebitdaAnualMes, multiplo);
  return { ebitdaAnualMes, valorEmpresaMes, valorCreado: valorEmpresaMes - valorEmpresa(anterior.ebitda * 12, multiplo) };
}

export interface Accion {
  clave: string;
  texto: string;
  /** Qué tan urgente: 1 primero. */
  prioridad: 1 | 2 | 3;
}

// ---------------------------------------------------------------------------------------------------------------------
// Contra el presupuesto
// ---------------------------------------------------------------------------------------------------------------------

type LineaPpto = { escenario: string; periodo: string; unidad_id: string | null; seccion: string; tipo_id?: string | null; monto: number };

/** Desempeño del mes contra el presupuesto (escenario base, todas las tiendas): ingresos, margen bruto, EBITDA y neto. */
export function desempenoVsPresupuesto(eerr: Eerr, lineas: LineaPpto[], mes: string): FilaComparacion[] {
  const filas = compararConReal(serieDeLineas(lineas, "base", [mes]), serieDeEerr(eerr), [mes]);
  return filas.filter((f) => f.concepto === "ingresos" || f.concepto === "margen_bruto" || f.concepto === "ebitda" || f.concepto === "resultado");
}

export interface DesvioTipo {
  seccion: Seccion;
  etiqueta: string;
  /** El nombre del tipo, «Otros de <sección>», o el de la sección si el presupuesto no tiene detalle por tipo. */
  tipo: string;
  real: number;
  presupuesto: number;
  /** real − presupuesto, como se lee en la sección. */
  diferencia: number;
  /** Diferencia sobre el presupuesto, en %; null si el presupuesto es cero. */
  pct: number | null;
  /** Cuánto movió el resultado contra el presupuesto: positivo mejora, negativo empeora. */
  impacto: number;
}

/**
 * Cada tipo del mes contra su presupuesto. Un tipo del real sin línea propia en el presupuesto suma en «Otros de
 * <sección>», como se presupuestó; una sección presupuestada sin detalle por tipo se compara entera. `nombresTipo`: id →
 * nombre de `fin_tipos`. Los retiros de dividendos no cuentan. Ordenado por impacto, el que más empeora primero.
 */
export function desviosPorTipo(eerr: Eerr, lineas: LineaPpto[], nombresTipo: Record<string, string>, mes: string): DesvioTipo[] {
  const ppto = detalleDeLineas(lineas, "base", [mes]);
  const out: DesvioTipo[] = [];
  for (const { clave, etiqueta } of SECCIONES) {
    const filas = ppto[clave];
    const bloque = eerr.secciones.find((s) => s.seccion === clave);
    const reales = (bloque?.tipos ?? [])
      .filter((t) => !(clave === "otros" && esDividendo(t.tipo)))
      .map((t) => ({ tipo: t.tipo, valor: valorEnSeccion(clave, t.signo, t.meses[mes] ?? 0) }));
    const otros = `Otros de ${etiqueta.toLowerCase()}`;
    const real = new Map<string, number>();
    const pres = new Map<string, number>();
    if (tieneTipos(filas)) {
      const propios = new Set(filas.filter((f) => f.tipo_id).map((f) => nombresTipo[f.tipo_id!] ?? f.tipo_id!));
      for (const f of filas) pres.set(f.tipo_id ? (nombresTipo[f.tipo_id] ?? f.tipo_id) : otros, f.meses[mes] ?? 0);
      for (const r of reales) {
        const k = propios.has(r.tipo) ? r.tipo : otros;
        real.set(k, (real.get(k) ?? 0) + r.valor);
      }
    } else {
      const p = filas.reduce((a, f) => a + (f.meses[mes] ?? 0), 0);
      const r = reales.reduce((a, x) => a + x.valor, 0);
      if (!filas.length && Math.abs(r) < 0.5) continue;
      pres.set(etiqueta, p);
      real.set(etiqueta, r);
    }
    for (const tipo of new Set([...pres.keys(), ...real.keys()])) {
      const r = redondear(real.get(tipo) ?? 0);
      const p = redondear(pres.get(tipo) ?? 0);
      const diferencia = redondear(r - p);
      if (Math.abs(diferencia) < 0.5 && Math.abs(p) < 0.5) continue;
      out.push({
        seccion: clave,
        etiqueta,
        tipo,
        real: r,
        presupuesto: p,
        diferencia,
        pct: Math.abs(p) < 0.005 ? null : (diferencia / Math.abs(p)) * 100,
        impacto: redondear(diferencia * SIGNO_SECCION[clave]),
      });
    }
  }
  return out.sort((a, b) => a.impacto - b.impacto);
}

/** Un gasto se pasa del presupuesto si lo supera en más de este % y de este monto. */
export const EXCESO_PCT = 10;
export const EXCESO_MONTO = 500;

/** Los gastos (no los ingresos) que se pasaron del presupuesto más de `EXCESO_PCT` % y de `EXCESO_MONTO` dólares. */
export const excesosDePresupuesto = (desvios: DesvioTipo[]) =>
  desvios.filter((d) => d.seccion !== "ingresos" && d.diferencia > EXCESO_MONTO && d.pct !== null && d.pct > EXCESO_PCT);

const usd0 = (v: number) => dinero(v);

/** Reglas simples sobre las cifras del mes, la cola de cierre (lo pendiente de cargar) y los excesos de presupuesto. */
export function accionesDelMes(
  actual: CifrasMes,
  anterior: CifrasMes,
  tiendas: TiendaMes[],
  pendientes: { titulo: string; cantidad: number }[],
  desvios: DesvioTipo[] = [],
): Accion[] {
  const acciones: Accion[] = [];
  const pts = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
  if (actual.ingresos > 0 && (actual.costoVentasPct ?? 0) < 10) {
    acciones.push({ clave: "costo", prioridad: 1, texto: "Cargar el costo de ventas del mes: el margen bruto está inflado mientras falte." });
  }
  for (const p of pendientes) {
    if (p.cantidad > 0) acciones.push({ clave: `pend-${p.titulo}`, prioridad: 1, texto: `${p.titulo}: ${p.cantidad} por resolver antes de cerrar el mes.` });
  }
  const mkt = pts(actual.marketingPct, anterior.marketingPct);
  if (mkt !== null && mkt >= 2) {
    acciones.push({ clave: "mkt", prioridad: 2, texto: `Marketing subió ${mkt.toFixed(1)} puntos sobre ingresos: revisar el retorno por tienda antes de sostener el gasto.` });
  }
  const adm = pts(actual.administracionPct, anterior.administracionPct);
  if (adm !== null && adm >= 2) {
    acciones.push({ clave: "adm", prioridad: 2, texto: `Administración subió ${adm.toFixed(1)} puntos sobre ingresos: revisar gastos fijos nuevos.` });
  }
  const varIng = variacion(actual.ingresos, anterior.ingresos);
  if (varIng !== null && varIng <= -10) {
    acciones.push({ clave: "ing", prioridad: 2, texto: `Los ingresos cayeron ${Math.abs(varIng).toFixed(0)} %: ver qué tiendas explican la caída.` });
  }
  for (const t of tiendas) {
    if (t.ingresos > 0 && t.ebitda < 0) {
      acciones.push({ clave: `neg-${t.nombre}`, prioridad: 2, texto: `${t.nombre} tuvo EBITDA negativo: revisar su margen de contribución y su marketing.` });
    }
  }
  for (const d of excesosDePresupuesto(desvios)) {
    acciones.push({
      clave: `ppto-${d.seccion}-${d.tipo}`,
      prioridad: 2,
      texto: `${d.tipo} (${d.etiqueta}) se pasó ${Math.round(d.pct!)} % del presupuesto: ${usd0(d.real)} contra ${usd0(d.presupuesto)}. Revisar el gasto o ajustar el presupuesto.`,
    });
  }
  return acciones.sort((a, b) => a.prioridad - b.prioridad);
}
