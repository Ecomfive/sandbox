import { celdaCsv } from "@/lib/tabla/csv";
import { antiguedadSaldos, type Edad } from "./operacion";

export interface SaldoParaEdad {
  quien: string;
  pendiente: number;
  dias: number;
}
export interface FilaAntiguedad extends Edad {
  quien: string;
}

/** Antigüedad del efectivo contra entrega pendiente por mensajero o transportadora; mayor deuda de +15 días primero. */
export function reporteAntiguedad(saldos: SaldoParaEdad[]): FilaAntiguedad[] {
  const por = new Map<string, SaldoParaEdad[]>();
  for (const s of saldos) por.set(s.quien, [...(por.get(s.quien) ?? []), s]);
  return [...por.entries()]
    .map(([quien, l]) => ({ quien, ...antiguedadSaldos(l) }))
    .filter((f) => f.total > 0)
    .sort((a, b) => b.d15_mas - a.d15_mas || b.total - a.total);
}

export function csvAntiguedad(filas: FilaAntiguedad[]): string {
  const lineas = [["Quién", "0-3 días", "4-7 días", "8-14 días", "15+ días", "Total"].map(celdaCsv).join(",")];
  for (const f of filas) lineas.push([f.quien, f.d0_3, f.d4_7, f.d8_14, f.d15_mas, f.total].map(celdaCsv).join(","));
  return "﻿" + lineas.join("\r\n") + "\r\n";
}
