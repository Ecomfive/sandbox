import { celdaCsv } from "@/lib/tabla/csv";
import { etiquetaMotivoFallo } from "@/lib/ventas/operacion";

export interface OrdenFallo {
  fase: string;
  motivo_codigo: string | null;
  motivo_texto: string | null;
}
export interface FilaMotivo {
  motivo: string;
  fallidas: number;
  devueltas: number;
  canceladas: number;
  total: number;
  porcentaje: number;
}

const FASES = ["fallida", "devuelta", "cancelada"];

/** Cuenta las órdenes fallidas, devueltas o canceladas por motivo (código; si no, el texto libre). */
export function motivosFallo(ordenes: OrdenFallo[]): FilaMotivo[] {
  const mapa = new Map<string, FilaMotivo>();
  let total = 0;
  for (const o of ordenes) {
    if (!FASES.includes(o.fase)) continue;
    const clave = o.motivo_codigo
      ? etiquetaMotivoFallo(o.motivo_codigo)
      : o.motivo_texto?.trim() || "Sin motivo";
    const f = mapa.get(clave) ?? { motivo: clave, fallidas: 0, devueltas: 0, canceladas: 0, total: 0, porcentaje: 0 };
    if (o.fase === "fallida") f.fallidas++;
    else if (o.fase === "devuelta") f.devueltas++;
    else f.canceladas++;
    f.total++;
    total++;
    mapa.set(clave, f);
  }
  return [...mapa.values()]
    .map((f) => ({ ...f, porcentaje: total ? f.total / total : 0 }))
    .sort((a, b) => b.total - a.total || a.motivo.localeCompare(b.motivo));
}

export function csvMotivos(filas: FilaMotivo[]): string {
  const enc = ["Motivo", "Fallidas", "Devueltas", "Canceladas", "Total", "% del total"];
  const lineas = filas.map((f) =>
    [f.motivo, f.fallidas, f.devueltas, f.canceladas, f.total, `${(f.porcentaje * 100).toFixed(1)}%`].map(celdaCsv).join(","),
  );
  return "﻿" + [enc.map(celdaCsv).join(","), ...lineas].join("\r\n") + "\r\n";
}
