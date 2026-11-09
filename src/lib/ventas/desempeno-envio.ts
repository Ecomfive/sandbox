import { celdaCsv } from "@/lib/tabla/csv";

export interface OrdenEnvio {
  fase: string;
  repartidor: string | null;
  transportista: string | null;
  fecha: string; // yyyy-mm-dd de la orden
  entregada_en: string | null;
}

export interface FilaDesempeno {
  quien: string;
  ordenes: number;
  entregadas: number;
  fallidas: number;
  devueltas: number;
  tasaEntrega: number; // % sobre las que ya tuvieron resultado
  diasPromedio: number | null;
}

const CIERRE = ["entregada", "fallida", "devuelta"];

/** Desempeño por mensajero o transportadora: solo cuentan las órdenes que ya salieron. */
export function desempenoEnvio(ordenes: OrdenEnvio[]): FilaDesempeno[] {
  const m = new Map<string, { o: number; e: number; f: number; d: number; dias: number[] }>();
  for (const o of ordenes) {
    const quien = (o.repartidor ?? o.transportista ?? "").trim();
    if (!quien || !(o.fase === "despachada" || CIERRE.includes(o.fase))) continue;
    const a = m.get(quien) ?? { o: 0, e: 0, f: 0, d: 0, dias: [] };
    a.o++;
    if (o.fase === "entregada") {
      a.e++;
      if (o.entregada_en) {
        const d = (Date.parse(o.entregada_en) - Date.parse(`${o.fecha}T00:00:00Z`)) / 86400000;
        if (d >= 0) a.dias.push(d);
      }
    } else if (o.fase === "fallida") a.f++;
    else if (o.fase === "devuelta") a.d++;
    m.set(quien, a);
  }
  return [...m.entries()]
    .map(([quien, a]) => {
      const cerradas = a.e + a.f + a.d;
      return {
        quien,
        ordenes: a.o,
        entregadas: a.e,
        fallidas: a.f,
        devueltas: a.d,
        tasaEntrega: cerradas ? Math.round((a.e / cerradas) * 1000) / 10 : 0,
        diasPromedio: a.dias.length ? Math.round((a.dias.reduce((s, x) => s + x, 0) / a.dias.length) * 10) / 10 : null,
      };
    })
    .sort((x, y) => y.ordenes - x.ordenes);
}

export function csvDesempeno(filas: FilaDesempeno[]): string {
  const enc = ["Mensajero o transportadora", "Órdenes salidas", "Entregadas", "Fallidas", "Devueltas", "% de entrega", "Días promedio a entregar"];
  const lineas = [enc, ...filas.map((f) => [f.quien, f.ordenes, f.entregadas, f.fallidas, f.devueltas, f.tasaEntrega, f.diasPromedio ?? ""])];
  return "﻿" + lineas.map((l) => l.map((c) => celdaCsv(c)).join(",")).join("\r\n");
}
