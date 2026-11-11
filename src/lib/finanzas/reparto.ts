// Portal AF4 360° › Reparto de A DISTRIBUIR con cualquier base y EERR consolidado sin intercompañía (migración 0929).
// Lógica pura: parte de las filas de `fin_eerr_partes` (lo cargado a cada unidad, A DISTRIBUIR sin repartir, con la parte
// intercompañía aparte) y devuelve las filas del EERR (`FilaEerr`) como las de `fin_eerr_mensual`, pero repartidas con la
// base elegida (envíos, ventas o margen bruto). Prueba en `reparto.test.ts`.

import type { FilaEerr, Seccion } from "./eerr";

export type BaseReparto = "envios" | "ventas" | "margen";

export const BASES_REPARTO: { clave: BaseReparto; etiqueta: string }[] = [
  { clave: "envios", etiqueta: "Envíos" },
  { clave: "ventas", etiqueta: "Ventas" },
  { clave: "margen", etiqueta: "Margen bruto" },
];

export const BASE_PREDETERMINADA: BaseReparto = "envios";

export const esBaseReparto = (v: unknown): v is BaseReparto => v === "envios" || v === "ventas" || v === "margen";

/** El valor de `fin_config.base_reparto` (jsonb «"ventas"») como base; cualquier otra cosa, envíos. */
export function leerBaseReparto(valor: unknown): BaseReparto {
  const v = typeof valor === "string" ? valor.replace(/"/g, "").trim() : "";
  return esBaseReparto(v) ? v : BASE_PREDETERMINADA;
}

export const etiquetaBase = (b: BaseReparto) => BASES_REPARTO.find((x) => x.clave === b)!.etiqueta;

/** Una fila de `fin_eerr_partes`, con el nombre y el orden del tipo. */
export interface ParteEerr {
  periodo: string;
  unidad_id: string;
  /** tienda · gestion · reparto (A DISTRIBUIR). */
  clase: string;
  entidad_id: string | null;
  tipo: string;
  orden: number;
  seccion: Seccion;
  signo: number;
  monto: number;
  monto_local: number;
  /** La parte intercompañía de `monto` (y de `monto_local`). */
  monto_ic: number;
  monto_ic_local: number;
}

export interface UnidadReparto {
  id: string;
  entidad_id: string | null;
  recibe_reparto: boolean;
}

export interface EnvioMes {
  periodo: string;
  unidad_id: string;
  envios: number;
}

/** Clave de un reparto: mes y entidad. */
const claveGrupo = (periodo: string, entidad: string | null) => `${periodo}|${entidad ?? ""}`;

/**
 * La participación de cada tienda en lo de A DISTRIBUIR de cada mes y entidad (suman 1 dentro del grupo). Solo tiendas
 * que reciben reparto y con peso positivo: envíos del mes, ventas netas cargadas directo a la tienda o su margen bruto.
 */
export function pesosReparto(
  base: BaseReparto,
  partes: ParteEerr[],
  envios: EnvioMes[],
  unidades: UnidadReparto[],
): Map<string, Map<string, number>> {
  const reciben = new Map(unidades.filter((u) => u.recibe_reparto).map((u) => [u.id, u]));
  const pesos = new Map<string, number>();
  const sumar = (periodo: string, unidad: string, v: number) => {
    const k = `${periodo}|${unidad}`;
    pesos.set(k, (pesos.get(k) ?? 0) + v);
  };
  if (base === "envios") {
    for (const e of envios) sumar(e.periodo, e.unidad_id, e.envios);
  } else {
    for (const p of partes) {
      if (p.clase === "reparto") continue;
      if (p.seccion === "ingresos" || (base === "margen" && p.seccion === "costo_ventas")) sumar(p.periodo, p.unidad_id, p.monto * p.signo);
    }
  }
  const grupos = new Map<string, Map<string, number>>();
  for (const [k, v] of pesos) {
    if (!(v > 0)) continue;
    const [periodo, unidad] = k.split("|");
    const u = reciben.get(unidad);
    if (!u) continue;
    const g = claveGrupo(periodo, u.entidad_id);
    const m = grupos.get(g) ?? new Map<string, number>();
    m.set(unidad, v);
    grupos.set(g, m);
  }
  for (const m of grupos.values()) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    for (const [u, v] of m) m.set(u, v / total);
  }
  return grupos;
}

export interface OpcionesReparto {
  /** En la moneda de la entidad (`monto_local`). */
  local?: boolean;
  /** Sin lo intercompañía (el consolidado). */
  sinIntercompania?: boolean;
}

export interface EerrRepartido {
  /** Todo junto: lo directo y lo repartido (como `fin_eerr_mensual`). */
  filas: FilaEerr[];
  /** Lo cargado directo a cada unidad. */
  directas: FilaEerr[];
  /** Lo de A DISTRIBUIR que recibió cada tienda. */
  repartidas: FilaEerr[];
  /** Lo de A DISTRIBUIR que quedó sin repartir (mes y entidad sin base). */
  pendiente: { periodo: string; entidad_id: string | null; monto: number }[];
  /** Efecto en el resultado de lo intercompañía que se dejó fuera, por mes. */
  eliminado: Record<string, number>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Reparte A DISTRIBUIR con los pesos dados y devuelve las filas del EERR por unidad. */
export function repartirEerr(partes: ParteEerr[], pesos: Map<string, Map<string, number>>, opciones: OpcionesReparto = {}): EerrRepartido {
  const directas = new Map<string, FilaEerr>();
  const repartidas = new Map<string, FilaEerr>();
  const pendiente = new Map<string, { periodo: string; entidad_id: string | null; monto: number }>();
  const eliminado: Record<string, number> = {};
  const acumular = (destino: Map<string, FilaEerr>, p: ParteEerr, unidad: string, monto: number) => {
    const k = `${p.periodo}|${unidad}|${p.tipo}`;
    const f = destino.get(k) ?? { periodo: p.periodo, unidad_id: unidad, tipo: p.tipo, orden: p.orden, seccion: p.seccion, signo: p.signo, monto: 0 };
    f.monto += monto;
    destino.set(k, f);
  };
  for (const p of partes) {
    const ic = opciones.sinIntercompania ? (opciones.local ? p.monto_ic_local : p.monto_ic) : 0;
    const monto = (opciones.local ? p.monto_local : p.monto) - ic;
    if (ic) eliminado[p.periodo] = r2((eliminado[p.periodo] ?? 0) + ic * p.signo);
    if (Math.abs(monto) < 0.000001) continue;
    if (p.clase !== "reparto") {
      acumular(directas, p, p.unidad_id, monto);
      continue;
    }
    const grupo = pesos.get(claveGrupo(p.periodo, p.entidad_id));
    if (!grupo || grupo.size === 0) {
      const k = claveGrupo(p.periodo, p.entidad_id);
      const x = pendiente.get(k) ?? { periodo: p.periodo, entidad_id: p.entidad_id, monto: 0 };
      x.monto = r2(x.monto + monto);
      pendiente.set(k, x);
      continue;
    }
    for (const [unidad, participacion] of grupo) acumular(repartidas, p, unidad, monto * participacion);
  }
  const redondear = (m: Map<string, FilaEerr>) => [...m.values()].map((f) => ({ ...f, monto: r2(f.monto) })).filter((f) => f.monto !== 0);
  const d = redondear(directas);
  const r = redondear(repartidas);
  return { filas: [...d, ...r], directas: d, repartidas: r, pendiente: [...pendiente.values()], eliminado };
}

/**
 * Cuánto pesa cada tienda en el reparto de un mes y entidad (0 si no recibe) — para el desglose de una cifra. Con `null`
 * (todas las tiendas juntas) es 1 si hay base en ese mes y entidad.
 */
export function participacionDe(pesos: Map<string, Map<string, number>>, periodo: string, entidad: string | null, unidad: string | null): number {
  const g = pesos.get(claveGrupo(periodo, entidad));
  if (!g || g.size === 0) return 0;
  if (!unidad) return 1;
  return g.get(unidad) ?? 0;
}
