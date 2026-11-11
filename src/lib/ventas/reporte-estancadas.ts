// Reporte de órdenes estancadas: llevan demasiados días en la misma fase (confirmada, despachada o fallida).
import { celdaCsv } from "@/lib/tabla/csv";
import { estancadas, UMBRALES_BASE, type Umbrales } from "./operacion";

export interface OrdenParaEstancar {
  id: string;
  numero: string;
  fase: string;
  /** Fecha ISO (o día) de la última entrada a la fase actual. */
  desde: string;
}
export interface FilaEstancada {
  numero: string;
  fase: string;
  dias: number;
}

const MS_DIA = 86_400_000;
export const diasDesde = (desde: string, ahora: Date): number => {
  const t = Date.parse(desde);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((ahora.getTime() - t) / MS_DIA));
};

export function reporteEstancadas(ordenes: OrdenParaEstancar[], ahora: Date, u: Umbrales = UMBRALES_BASE): FilaEstancada[] {
  const numeroDe = new Map(ordenes.map((o) => [o.id, o.numero]));
  return estancadas(ordenes.map((o) => ({ id: o.id, fase: o.fase, diasEnFase: diasDesde(o.desde, ahora) })), u).map((e) => ({
    numero: numeroDe.get(e.id) ?? e.id,
    fase: e.fase,
    dias: e.dias,
  }));
}

export function csvEstancadas(filas: FilaEstancada[]): string {
  const lineas = [["Orden", "Fase", "Días en la fase"].join(",")];
  for (const f of filas) lineas.push([celdaCsv(f.numero), celdaCsv(f.fase), String(f.dias)].join(","));
  return "﻿" + lineas.join("\r\n") + "\r\n";
}
