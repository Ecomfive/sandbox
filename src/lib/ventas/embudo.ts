// Embudo del pipeline: cuántas órdenes llegaron a cada fase y cuánto tardan en pasar de una a otra.
import { celdaCsv } from "@/lib/tabla/csv";

export interface EventoFase {
  orden_id: string;
  fase_despues: string | null;
  creado_en: string;
}

export const ETAPAS_EMBUDO = ["por_confirmar", "confirmada", "despachada", "entregada"] as const;
export const SALIDAS_EMBUDO = ["fallida", "devuelta", "cancelada"] as const;

export interface FilaEmbudo {
  fase: string;
  ordenes: number;
  /** % sobre la fase anterior del embudo (la primera es 100). */
  conversion: number;
  /** Horas promedio desde la fase anterior; null si no hay datos. */
  horasPromedio: number | null;
}

/** Cada orden cuenta una vez por fase alcanzada; el tiempo es de la primera vez que entró a cada una. */
export function embudo(ordenesCreadas: { id: string; creado_en: string }[], eventos: EventoFase[]): { etapas: FilaEmbudo[]; salidas: { fase: string; ordenes: number }[] } {
  const porOrden = new Map<string, Map<string, number>>();
  for (const o of ordenesCreadas) porOrden.set(o.id, new Map([["por_confirmar", Date.parse(o.creado_en)]]));
  for (const e of eventos) {
    if (!e.fase_despues) continue;
    const m = porOrden.get(e.orden_id);
    const t = Date.parse(e.creado_en);
    if (!m || Number.isNaN(t)) continue;
    const previo = m.get(e.fase_despues);
    if (previo === undefined || t < previo) m.set(e.fase_despues, t);
  }
  const etapas: FilaEmbudo[] = [];
  let anterior = 0;
  ETAPAS_EMBUDO.forEach((fase, i) => {
    let n = 0, suma = 0, con = 0;
    for (const m of porOrden.values()) {
      if (!m.has(fase)) continue;
      n++;
      const previa = i > 0 ? m.get(ETAPAS_EMBUDO[i - 1]) : undefined;
      if (previa !== undefined) { suma += Math.max(0, m.get(fase)! - previa); con++; }
    }
    etapas.push({
      fase, ordenes: n,
      conversion: i === 0 ? 100 : anterior > 0 ? Math.round((n / anterior) * 1000) / 10 : 0,
      horasPromedio: con > 0 ? Math.round((suma / con / 3_600_000) * 10) / 10 : null,
    });
    anterior = n;
  });
  const salidas = SALIDAS_EMBUDO.map((fase) => ({ fase, ordenes: [...porOrden.values()].filter((m) => m.has(fase)).length }));
  return { etapas, salidas };
}

export function csvEmbudo(r: ReturnType<typeof embudo>): string {
  const filas = [["Fase", "Órdenes", "% de la fase anterior", "Horas promedio desde la fase anterior"]];
  for (const e of r.etapas) filas.push([e.fase, String(e.ordenes), String(e.conversion), e.horasPromedio === null ? "" : String(e.horasPromedio)]);
  for (const s of r.salidas) filas.push([s.fase, String(s.ordenes), "", ""]);
  return "﻿" + filas.map((f) => f.map((c) => celdaCsv(c)).join(",")).join("\r\n");
}
