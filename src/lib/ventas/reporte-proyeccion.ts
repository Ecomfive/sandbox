import { celdaCsv } from "@/lib/tabla/csv";
import { proyeccionCaja } from "./operacion";

export interface EntradaProyeccion {
  enRuta: { cod: number }[];
  pendientesRemesa: number;
  entregadas: number;
  perdidas: number; // fallidas + devueltas + canceladas tras salir
}

export interface FilaProyeccion { concepto: string; monto: number }

/** Tasa histórica de entrega = entregadas ÷ (entregadas + perdidas); sin historia, 0. */
export const tasaHistorica = (entregadas: number, perdidas: number) => {
  const t = entregadas + perdidas;
  return t > 0 ? entregadas / t : 0;
};

export function reporteProyeccion(e: EntradaProyeccion): FilaProyeccion[] {
  const tasa = tasaHistorica(e.entregadas, e.perdidas);
  const p = proyeccionCaja(e.enRuta, e.pendientesRemesa, tasa);
  return [
    { concepto: "Efectivo en ruta (órdenes despachadas)", monto: p.enRuta },
    { concepto: `Tasa de entrega histórica (${Math.round(tasa * 1000) / 10} %)`, monto: p.esperado },
    { concepto: "Pendiente de remesa (ya entregado)", monto: Math.round(e.pendientesRemesa * 100) / 100 },
    { concepto: "Caja esperada", monto: p.total },
  ];
}

export function csvProyeccion(filas: FilaProyeccion[]): string {
  const l = [["Concepto", "Monto"].map(celdaCsv).join(",")];
  for (const f of filas) l.push([f.concepto, f.monto].map(celdaCsv).join(","));
  return "﻿" + l.join("\r\n") + "\r\n";
}
