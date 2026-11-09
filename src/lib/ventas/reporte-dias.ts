import { celdaCsv } from "@/lib/tabla/csv";

export interface OrdenParaDia { fecha: string; fase: string | null; total: number }
export interface FilaDia { fecha: string; ordenes: number; vendido: number; entregadas: number; canceladas: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Serie diaria: órdenes creadas, vendido (sin canceladas), entregadas y canceladas, con los días sin órdenes en cero. */
export function reporteDias(ordenes: OrdenParaDia[], desde: string, hasta: string): FilaDia[] {
  const por = new Map<string, FilaDia>();
  for (let d = new Date(`${desde}T00:00:00Z`); d <= new Date(`${hasta}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
    const f = d.toISOString().slice(0, 10);
    por.set(f, { fecha: f, ordenes: 0, vendido: 0, entregadas: 0, canceladas: 0 });
  }
  for (const o of ordenes) {
    const f = por.get(o.fecha.slice(0, 10));
    if (!f) continue;
    f.ordenes += 1;
    if (o.fase === "cancelada") f.canceladas += 1;
    else f.vendido += o.total;
    if (o.fase === "entregada") f.entregadas += 1;
  }
  return [...por.values()].map((f) => ({ ...f, vendido: r2(f.vendido) }));
}

export function csvDias(filas: FilaDia[]): string {
  const l = [["Fecha", "Órdenes", "Vendido", "Entregadas", "Canceladas"].map(celdaCsv).join(",")];
  for (const f of filas) l.push([f.fecha, f.ordenes, f.vendido, f.entregadas, f.canceladas].map(celdaCsv).join(","));
  return "﻿" + l.join("\r\n") + "\r\n";
}
