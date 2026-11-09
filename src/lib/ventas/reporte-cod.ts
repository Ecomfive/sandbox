// Reporte de efectivo contra entrega por quien lo cobra (mensajero o transportadora): cuánto debe, desde hace
// cuánto y cuánto del saldo está vencido. Puro, sin React, para poder probarlo. Sirve al CSV y a cualquier pantalla.

import { celdaCsv } from "@/lib/tabla/csv";

export interface SaldoCod {
  quien: string;
  numero: string;
  esperado: number;
  cobrado: number;
  remitido: number;
  pendiente: number;
  dias: number;
}

export interface FilaReporteCod {
  quien: string;
  ordenes: number;
  esperado: number;
  cobrado: number;
  remitido: number;
  pendiente: number;
  vencido: number;
  maxDias: number;
  faltante: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Una fila por quien cobra, de mayor a menor saldo vencido y luego pendiente. `plazo` = días para devolver el efectivo. */
export function reporteCod(saldos: SaldoCod[], plazo = 3): FilaReporteCod[] {
  const por = new Map<string, FilaReporteCod>();
  for (const s of saldos) {
    const f = por.get(s.quien) ?? { quien: s.quien, ordenes: 0, esperado: 0, cobrado: 0, remitido: 0, pendiente: 0, vencido: 0, maxDias: 0, faltante: 0 };
    const pend = Math.max(0, s.pendiente);
    f.ordenes += 1;
    f.esperado += s.esperado;
    f.cobrado += s.cobrado;
    f.remitido += s.remitido;
    f.pendiente += pend;
    if (s.dias > plazo) f.vencido += pend;
    f.maxDias = Math.max(f.maxDias, s.dias);
    f.faltante += Math.max(0, s.esperado - s.cobrado);
    por.set(s.quien, f);
  }
  return [...por.values()]
    .map((f) => ({ ...f, esperado: r2(f.esperado), cobrado: r2(f.cobrado), remitido: r2(f.remitido), pendiente: r2(f.pendiente), vencido: r2(f.vencido), faltante: r2(f.faltante) }))
    .sort((a, b) => b.vencido - a.vencido || b.pendiente - a.pendiente || a.quien.localeCompare(b.quien));
}

const ENCABEZADO = ["Quien cobra", "Órdenes", "Esperado", "Cobrado", "Devuelto", "Pendiente", "Vencido", "Días del más viejo", "Cobró de menos"];

export function csvReporteCod(filas: FilaReporteCod[]): string {
  const total = filas.reduce(
    (t, f) => ({ ordenes: t.ordenes + f.ordenes, esperado: t.esperado + f.esperado, cobrado: t.cobrado + f.cobrado, remitido: t.remitido + f.remitido, pendiente: t.pendiente + f.pendiente, vencido: t.vencido + f.vencido, faltante: t.faltante + f.faltante }),
    { ordenes: 0, esperado: 0, cobrado: 0, remitido: 0, pendiente: 0, vencido: 0, faltante: 0 },
  );
  const lineas = filas.map((f) => [f.quien, f.ordenes, f.esperado, f.cobrado, f.remitido, f.pendiente, f.vencido, f.maxDias, f.faltante]);
  lineas.push(["Total", total.ordenes, r2(total.esperado), r2(total.cobrado), r2(total.remitido), r2(total.pendiente), r2(total.vencido), "", r2(total.faltante)]);
  return "﻿" + [ENCABEZADO, ...lineas].map((l) => l.map(celdaCsv).join(",")).join("\r\n");
}
