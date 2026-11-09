import { celdaCsv } from "@/lib/tabla/csv";

export interface OrdenParaTienda { tienda: string; fase: string | null; total: number }
export interface FilaTienda { tienda: string; ordenes: number; vendido: number; entregadas: number; perdidas: number; pctEntrega: number | null }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Resumen por tienda: órdenes, vendido, entregadas, perdidas y % de entrega sobre las cerradas (entregadas + perdidas). */
export function reporteTiendas(ordenes: OrdenParaTienda[]): FilaTienda[] {
  const por = new Map<string, FilaTienda>();
  for (const o of ordenes) {
    const f = por.get(o.tienda) ?? { tienda: o.tienda, ordenes: 0, vendido: 0, entregadas: 0, perdidas: 0, pctEntrega: null };
    f.ordenes += 1;
    if (o.fase !== "cancelada") f.vendido += o.total;
    if (o.fase === "entregada") f.entregadas += 1;
    if (o.fase === "fallida" || o.fase === "devuelta") f.perdidas += 1;
    por.set(o.tienda, f);
  }
  return [...por.values()]
    .map((f) => {
      const cerradas = f.entregadas + f.perdidas;
      return { ...f, vendido: r2(f.vendido), pctEntrega: cerradas > 0 ? r2((f.entregadas / cerradas) * 100) : null };
    })
    .sort((a, b) => b.vendido - a.vendido);
}

export function csvTiendas(filas: FilaTienda[]): string {
  const l = [["Tienda", "Órdenes", "Vendido", "Entregadas", "Fallidas o devueltas", "% entrega"].map(celdaCsv).join(",")];
  for (const f of filas) l.push([f.tienda, f.ordenes, f.vendido, f.entregadas, f.perdidas, f.pctEntrega].map(celdaCsv).join(","));
  return "﻿" + l.join("\r\n") + "\r\n";
}
