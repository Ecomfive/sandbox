import { celdaCsv } from "@/lib/tabla/csv";

export interface LineaParaProducto { producto: string; cantidad: number; precio: number; fase: string | null; orden: string }
export interface FilaProducto { producto: string; unidades: number; ingreso: number; ordenes: number; entregadas: number; pctEntrega: number | null }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Productos más vendidos: unidades e ingreso sin canceladas, órdenes distintas y % de unidades entregadas sobre las cerradas. */
export function reporteProductos(lineas: LineaParaProducto[]): FilaProducto[] {
  const por = new Map<string, { f: FilaProducto; ords: Set<string>; perdidas: number }>();
  for (const l of lineas) {
    if (l.fase === "cancelada") continue;
    const e = por.get(l.producto) ?? { f: { producto: l.producto, unidades: 0, ingreso: 0, ordenes: 0, entregadas: 0, pctEntrega: null }, ords: new Set<string>(), perdidas: 0 };
    e.f.unidades += l.cantidad;
    e.f.ingreso += l.cantidad * l.precio;
    e.ords.add(l.orden);
    if (l.fase === "entregada") e.f.entregadas += l.cantidad;
    if (l.fase === "fallida" || l.fase === "devuelta") e.perdidas += l.cantidad;
    por.set(l.producto, e);
  }
  return [...por.values()]
    .map(({ f, ords, perdidas }) => {
      const cerradas = f.entregadas + perdidas;
      return { ...f, ingreso: r2(f.ingreso), ordenes: ords.size, pctEntrega: cerradas > 0 ? r2((f.entregadas / cerradas) * 100) : null };
    })
    .sort((a, b) => b.unidades - a.unidades || b.ingreso - a.ingreso);
}

export function csvProductos(filas: FilaProducto[]): string {
  const l = [["Producto", "Unidades", "Ingreso", "Órdenes", "Unidades entregadas", "% entrega"].map(celdaCsv).join(",")];
  for (const f of filas) l.push([f.producto, f.unidades, f.ingreso, f.ordenes, f.entregadas, f.pctEntrega].map(celdaCsv).join(","));
  return "﻿" + l.join("\r\n") + "\r\n";
}
