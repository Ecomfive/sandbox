// Lo que viene en camino de un producto: las unidades de sus compras que ya se pidieron y todavía no llegan, sumadas por país.
// Cuenta una orden abierta, sin fecha de llegada, que **ya salió** (tiene fecha de envío) o **ya está en marcha** (En Producción,
// Tracking o Arribo Mercancía: pedida y pagada aunque todavía no se envíe). Una orden en Cotizar, Cotizado o Backlog es solo una
// cotización: no cuenta. Una orden anulada tampoco. Sin base ni React, para poder probarlo.

import { estimarPlanificacion, type TiemposTransito } from "./planificacion";

/** Las etapas con que una orden ya está cerrada (las mismas de `ETAPAS_CERRADAS` en Compras). */
const ETAPAS_CERRADAS = ["completado", "descartado"];

export interface LineaEnCamino {
  /** El nombre del país («Panamá»), que es lo que se muestra. */
  pais: string | null;
  /** Su código («PA»), para quedarse con un solo país. */
  codigoPais?: string | null;
  unidades: number;
  etapa: string;
  fechaEnvio: string | null;
  fechaLlegada: string | null;
  anulada: boolean;
}

export interface EnCaminoPais {
  pais: string;
  unidades: number;
  compras: number;
}

/** Las etapas en que la mercancía ya está pedida (se produce, viaja o llegó al puerto) aunque todavía no tenga fecha de envío. */
export const ETAPAS_EN_MARCHA = ["produccion", "tracking", "arribo_mercancia"];

/** Una línea está en camino: orden abierta, sin llegar, que ya salió o ya está en producción, tracking o arribo. */
export const lineaEnCamino = (l: LineaEnCamino): boolean =>
  !l.anulada && !ETAPAS_CERRADAS.includes(l.etapa) && !l.fechaLlegada && (!!l.fechaEnvio || ETAPAS_EN_MARCHA.includes(l.etapa));

/**
 * Las unidades en camino por país, el país con más unidades primero. Con `codigoPais` solo las de ese país (el que está marcado en
 * Compras). Sin nada en camino, lista vacía.
 */
export function enCaminoPorPais(lineas: LineaEnCamino[], codigoPais?: string | null): EnCaminoPais[] {
  const porPais = new Map<string, EnCaminoPais>();
  for (const l of lineas) {
    if (!lineaEnCamino(l) || !(l.unidades > 0)) continue;
    if (codigoPais && (l.codigoPais ?? "").toUpperCase() !== codigoPais.toUpperCase()) continue;
    const pais = l.pais ?? "—";
    const actual = porPais.get(pais) ?? { pais, unidades: 0, compras: 0 };
    actual.unidades += l.unidades;
    actual.compras += 1;
    porPais.set(pais, actual);
  }
  return [...porPais.values()].sort((a, b) => b.unidades - a.unidades || a.pais.localeCompare(b.pais, "es"));
}

/** Lo que hace falta de una compra para saber cuándo llega. */
export interface CompraParaLlegada {
  fechaLimite: string | null;
  fechaEnvio: string | null;
  /** Aire, mar o tierra. */
  vias: string[];
  /** De qué país se miden sus envíos (el id del país, o «importacion»). */
  clave: string;
}

export interface Llegada {
  /** «2026-11-12». */
  fecha: string;
  /** La fecha límite que se puso en la compra, o la estimada con su fecha de envío y lo que tarda su vía. */
  origen: "limite" | "estimada";
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}/;

/**
 * Cuándo llega una compra que ya salió: su **fecha límite** si la tiene puesta; si no, la estimada (fecha de envío más lo que
 * tardan los envíos de ese país por esa vía, `estimarPlanificacion`), que necesita la fecha de envío **y** la vía de envío. Si no
 * se puede saber, null: la compra todavía no tiene fecha de llegada y faltan esos datos en Compras.
 */
export function llegadaDeCompra(tiempos: TiemposTransito, c: CompraParaLlegada): Llegada | null {
  if (c.fechaLimite && ES_FECHA.test(c.fechaLimite)) return { fecha: c.fechaLimite.slice(0, 10), origen: "limite" };
  if (!c.fechaEnvio || c.vias.length === 0) return null;
  const e = estimarPlanificacion(tiempos, c.clave, c.vias, c.fechaEnvio);
  return e ? { fecha: e.llegadaEstimada, origen: "estimada" } : null;
}

export interface ResumenLlegada {
  unidades: number;
  /** La llegada más próxima entre las órdenes que la tienen; null si ninguna. */
  llegada: string | null;
  /** Las unidades de órdenes que todavía no tienen fecha de llegada. */
  sinFecha: number;
}

/** Junta las órdenes en camino de un producto: sus unidades, la llegada más próxima y cuántas unidades no tienen fecha. */
export function resumenLlegada(ordenes: { unidades: number; llegada: string | null }[]): ResumenLlegada {
  let llegada: string | null = null;
  let sinFecha = 0;
  let unidades = 0;
  for (const o of ordenes) {
    unidades += o.unidades;
    if (o.llegada === null) sinFecha += o.unidades;
    else if (llegada === null || o.llegada < llegada) llegada = o.llegada;
  }
  return { unidades, llegada, sinFecha };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2026-11-12» → «12 nov» (con el año si no es el de `hoy`: «12 nov 2027»). Sin pasar por Date. */
export function llegadaCorta(fecha: string, hoy: string): string {
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return `${Number(d)} ${MESES[Number(m) - 1] ?? m}${a !== hoy.slice(0, 4) ? ` ${a}` : ""}`;
}
