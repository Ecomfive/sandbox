// Costo de financiamiento por orden de compra (pedido de María José, Oceans, 19 nov 2026). Cuando un financista fondea una
// OC (Ortoped&Co: 20 % por ciclo), lo que cobra es parte del costo de esa mercancía, pero va como una **línea aparte**:
// así se ve el costo del producto con y sin financiamiento y se puede decidir si conviene financiar.
//
// De dónde sale (Préstamos del grupo, `fin_grupo_movimientos`, que ya guarda qué OC fondeó cada préstamo en `ordenes`):
//  - Real: los cargos «costo» con sus OC se reparten entre esas OC.
//  - Estimado: un préstamo con OC al que todavía no se le cargó costo, con la tasa del financista:
//    monto × tasa del ciclo × días ÷ días del ciclo. Los días van del préstamo a su vencimiento (o a hoy si no vence).
//    Sin «días del ciclo», el ciclo es el plazo del propio préstamo (cobra una vez la tasa).
// Cuando un préstamo fondea varias OC, se reparte por el FOB de cada una (si alguna no lo tiene, en partes iguales).
// Lógica pura, con prueba en `financiamiento-orden.test.ts`.

import type { MovGrupo } from "./prestamos-grupo";

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const DIA = 86_400_000;
const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA);

export interface TasaFinancista {
  /** Lo que cobra por ciclo (0.2 = 20 %). */
  tasaCiclo: number;
  /** Días de un ciclo; null = el plazo de cada préstamo. */
  diasCiclo: number | null;
}

export interface FinanciamientoOrden {
  codigo: string;
  /** Capital prestado para esta OC. */
  capital: number;
  /** Costo ya cargado por el financista. */
  real: number;
  /** Costo calculado con la tasa, de préstamos sin cargo todavía. */
  estimado: number;
  total: number;
}

export const codigoOrden = (v: string) => v.trim().toUpperCase();

/** Reparte `monto` entre las OC por su FOB (o en partes iguales), con los centavos exactos. */
export function repartirEntreOrdenes(monto: number, ordenes: string[], fob: Map<string, number>): Map<string, number> {
  const ocs = [...new Set(ordenes.map(codigoOrden))];
  const salida = new Map<string, number>();
  if (!ocs.length) return salida;
  const pesos = ocs.map((o) => fob.get(o) ?? 0);
  const usarFob = pesos.every((p) => p > 0);
  const suma = usarFob ? pesos.reduce((a, b) => a + b, 0) : ocs.length;
  let acumulado = 0;
  let previo = 0;
  ocs.forEach((o, i) => {
    acumulado += usarFob ? pesos[i] : 1;
    const hasta = i === ocs.length - 1 ? r2(monto) : r2((monto * acumulado) / suma);
    salida.set(o, r2(hasta - previo));
    previo = hasta;
  });
  return salida;
}

/** Costo estimado de un préstamo con la tasa del financista. */
export function costoEstimado(p: Pick<MovGrupo, "monto" | "fecha" | "vence">, tasa: TasaFinancista, hoy: string): number {
  if (!(tasa.tasaCiclo > 0)) return 0;
  const fin = p.vence ?? hoy;
  const d = dias(p.fecha, fin);
  if (d <= 0) return 0;
  const ciclo = tasa.diasCiclo && tasa.diasCiclo > 0 ? tasa.diasCiclo : d;
  return r2((p.monto * tasa.tasaCiclo * d) / ciclo);
}

/** El costo de financiamiento de cada OC (por código en mayúsculas). */
export function financiamientoPorOrden(
  movs: MovGrupo[],
  tasas: Map<string, TasaFinancista>,
  fob: Map<string, number>,
  hoy: string,
): Map<string, FinanciamientoOrden> {
  const fobNorm = new Map([...fob].map(([k, v]) => [codigoOrden(k), v]));
  const salida = new Map<string, FinanciamientoOrden>();
  const de = (codigo: string) => {
    let f = salida.get(codigo);
    if (!f) salida.set(codigo, (f = { codigo, capital: 0, real: 0, estimado: 0, total: 0 }));
    return f;
  };
  const llave = (m: MovGrupo) => `${m.acreedorId}|${m.deudorId}|${[...new Set(m.ordenes.map(codigoOrden))].sort().join(",")}`;
  const conCosto = new Set<string>();
  for (const c of movs) {
    if (c.tipo !== "costo" || !c.ordenes.length) continue;
    conCosto.add(llave(c));
    for (const [o, v] of repartirEntreOrdenes(c.monto, c.ordenes, fobNorm)) de(o).real += v;
  }
  for (const p of movs) {
    if (p.tipo !== "prestamo" || !p.ordenes.length) continue;
    for (const [o, v] of repartirEntreOrdenes(p.monto, p.ordenes, fobNorm)) de(o).capital += v;
    const tasa = tasas.get(p.acreedorId);
    if (conCosto.has(llave(p)) || !tasa) continue;
    for (const [o, v] of repartirEntreOrdenes(costoEstimado(p, tasa, hoy), p.ordenes, fobNorm)) de(o).estimado += v;
  }
  for (const f of salida.values()) {
    f.capital = r2(f.capital);
    f.real = r2(f.real);
    f.estimado = r2(f.estimado);
    f.total = r2(f.real + f.estimado);
  }
  return salida;
}

/** Lo que se suma al costo puesto de una compra: el total y el costo por unidad con financiamiento. */
export function conFinanciamiento<T extends { codigo: string; total: number; unidades: number }>(
  costos: T[],
  porOrden: Map<string, FinanciamientoOrden>,
): (T & { financiamiento: FinanciamientoOrden | null; unitarioConFinanciamiento: number | null })[] {
  return costos.map((c) => {
    const f = porOrden.get(codigoOrden(c.codigo)) ?? null;
    const total = c.total + (f?.total ?? 0);
    return { ...c, financiamiento: f && f.total > 0 ? f : null, unitarioConFinanciamiento: c.unidades > 0 ? Math.round((total / c.unidades) * 10_000) / 10_000 : null };
  });
}
