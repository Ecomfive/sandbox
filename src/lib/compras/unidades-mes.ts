// Unidades compradas y su valor, mes a mes (pedido de Alcides, 19 oct 2026), para la tarjeta del Dashboard de Compras. Cada
// compra cuenta en el mes en que se creó (como «Compras y pagos por mes»); las descartadas y anuladas no se compraron y no
// cuentan. Lógica pura, con prueba.
import { MESES_PLANIFICACION } from "./planificacion";

export type Periodo = "este_anio" | "ultimos_12" | "anio_pasado";

export interface CompraUnidades {
  creadoEn: string;
  etapa: string;
  qtyTotal: number | null;
  montoTotal: number | null;
  anulada?: unknown;
}

/** Los meses («2026-01»…) de un periodo, contados desde `hoy`. */
export function mesesDelPeriodo(periodo: Periodo, hoy: string): string[] {
  const a = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7));
  const mes = (anio: number, i: number) => new Date(Date.UTC(anio, i, 1)).toISOString().slice(0, 7);
  if (periodo === "este_anio") return Array.from({ length: m }, (_, i) => mes(a, i));
  if (periodo === "anio_pasado") return Array.from({ length: 12 }, (_, i) => mes(a - 1, i));
  return Array.from({ length: 12 }, (_, i) => mes(a, m - 12 + i));
}

/** «2026-03» → «Mar 26». */
export const etiquetaMesCorta = (mes: string) => `${MESES_PLANIFICACION[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`;

export interface PuntoMes {
  mes: string;
  etiqueta: string;
  unidades: number;
  valor: number;
  compras: number;
}

export function unidadesPorMes(compras: CompraUnidades[], periodo: Periodo, hoy: string): { serie: PuntoMes[]; unidades: number; valor: number; compras: number } {
  const meses = mesesDelPeriodo(periodo, hoy);
  const puntos = new Map(meses.map((m) => [m, { mes: m, etiqueta: etiquetaMesCorta(m), unidades: 0, valor: 0, compras: 0 }]));
  for (const c of compras) {
    if (c.anulada || c.etapa === "descartado") continue;
    const p = puntos.get(c.creadoEn.slice(0, 7));
    if (!p) continue;
    p.unidades += c.qtyTotal ?? 0;
    p.valor += c.montoTotal ?? 0;
    p.compras += 1;
  }
  const serie = [...puntos.values()];
  return { serie, unidades: serie.reduce((s, p) => s + p.unidades, 0), valor: serie.reduce((s, p) => s + p.valor, 0), compras: serie.reduce((s, p) => s + p.compras, 0) };
}
