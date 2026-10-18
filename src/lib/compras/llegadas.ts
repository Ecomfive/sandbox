// Lo que llega en los próximos meses (pedido de Alcides, 18 oct 2026): las compras abiertas que todavía no llegan, repartidas por
// su Planificación («Nov26», el mes en que se espera que lleguen; ver `planificacion.ts`). El mes en curso y los 3 siguientes,
// más las que ya debían haber llegado y no llegan. Lógica pura: la usa el Dashboard de Compras y su prueba.
import { MESES_PLANIFICACION } from "./planificacion";

/** Las etapas en que la mercancía ya llegó o la compra terminó: no cuentan como «por llegar». */
const ETAPAS_YA_LLEGO = ["arribo_mercancia", "completado", "descartado"];

export interface CompraPorLlegar {
  etapa: string;
  fechaLlegada: string | null;
  planificacion: string | null;
  anulada?: unknown;
}

/** «Nov26» → «2026-11»; null si no se entiende. */
export function mesDePlanificacion(p: string | null): string | null {
  const m = /^([A-Za-zÁÉÍÓÚáéíóú]{3})\s*'?(\d{2})$/.exec((p ?? "").trim());
  if (!m) return null;
  const i = MESES_PLANIFICACION.findIndex((x) => x.toLowerCase() === m[1].toLowerCase());
  return i < 0 ? null : `20${m[2]}-${String(i + 1).padStart(2, "0")}`;
}

/** Abierta, sin anular y sin llegar todavía. */
export const porLlegar = (c: CompraPorLlegar) => !c.anulada && !c.fechaLlegada && !ETAPAS_YA_LLEGO.includes(c.etapa);

/** El mes en curso y los `adelante` siguientes, como «2026-10». */
export function mesesSiguientes(hoy: string, adelante = 3): string[] {
  const a = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7)) - 1;
  return Array.from({ length: adelante + 1 }, (_, i) => {
    const d = new Date(Date.UTC(a, m + i, 1));
    return d.toISOString().slice(0, 7);
  });
}

/** «2026-11» → «Nov 2026». */
export const etiquetaMes = (mes: string) => `${MESES_PLANIFICACION[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

/**
 * A qué columna va una compra por llegar: su mes (si está entre los que se ven), «antes» si ya debía haber llegado, «despues»
 * si es más adelante, «sin» si no tiene planificación (aún no tiene fecha de envío). null si no está por llegar.
 */
export function cubetaLlegada(c: CompraPorLlegar, meses: string[]): string | null {
  if (!porLlegar(c)) return null;
  const mes = mesDePlanificacion(c.planificacion);
  if (!mes) return "sin";
  if (mes < meses[0]) return "antes";
  if (mes > meses[meses.length - 1]) return "despues";
  return mes;
}
