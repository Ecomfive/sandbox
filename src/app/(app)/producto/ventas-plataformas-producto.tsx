"use client";

import { useEffect, useState } from "react";
import { LOGO_PLATAFORMA } from "@/components/plataformas/selector-plataforma";
import { obtenerVentasPlataformasProducto, type VentasEnPlataforma } from "./ventas-plataformas-actions";

const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}` : "—");

/**
 * «Ventas por plataforma» de la ficha de un producto (12 nov 2026, pedido de Hernán): una fila por plataforma del país donde el producto está publicado (Dropi, Drop, Effi,
 * Dunamixfy) con sus netas de 30 días, en total y su stock allá, y la suma de todas. Solo se dibuja en un país con más de una plataforma (hoy Costa Rica) y con al menos una
 * plataforma; el detalle de Dropi sigue en su propio bloque.
 */
export function VentasPlataformasProducto({ id, pais }: { id: string; pais: string }) {
  const [filas, setFilas] = useState<VentasEnPlataforma[] | "error" | null>(null);
  useEffect(() => {
    let vigente = true;
    obtenerVentasPlataformasProducto(id, pais)
      .then((r) => vigente && setFilas("filas" in r ? r.filas : "error"))
      .catch(() => vigente && setFilas("error"));
    return () => {
      vigente = false;
    };
  }, [id, pais]);

  if (filas === null) return <p className="m-0 text-sm text-muted-foreground">Cargando…</p>;
  if (filas === "error")
    return (
      <p role="alert" className="m-0 text-sm text-destructive">
        No se pudieron cargar las ventas por plataforma.
      </p>
    );
  if (!filas.length) return <p className="m-0 text-sm text-muted-foreground">El producto no está publicado en ninguna plataforma de este país.</p>;
  const total = filas.reduce((t, f) => ({ netas30: t.netas30 + f.netas30, netasTotal: t.netasTotal + f.netasTotal, stock: t.stock + f.stock }), { netas30: 0, netasTotal: 0, stock: 0 });
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Ventas del producto por plataforma</caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="py-1 pr-2 text-left font-medium">
              Plataforma
            </th>
            <th scope="col" className="py-1 pl-2 text-right font-medium">
              Netas · 30 días
            </th>
            <th scope="col" className="py-1 pl-2 text-right font-medium">
              Netas en total
            </th>
            <th scope="col" className="py-1 pl-2 text-right font-medium">
              Stock
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const Logo = LOGO_PLATAFORMA[f.plataforma];
            return (
              <tr key={f.plataforma} className="border-t border-border align-top">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                  <span className="flex items-center gap-2">
                    <Logo marca aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{f.nombre}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {f.ids.slice(0, 4).join(", ")}
                    {f.ids.length > 4 ? ` y ${f.ids.length - 4} más` : ""}
                    {f.corte ? ` · hasta el ${fecha(f.corte)}` : " · sin ventas leídas"}
                  </span>
                </th>
                <td className="py-1.5 pl-2 text-right tabular-nums">{entero(f.netas30)}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{entero(f.netasTotal)}</td>
                <td className={`py-1.5 pl-2 text-right tabular-nums ${f.stock > 0 ? "" : "font-medium text-destructive"}`}>{f.stock > 0 ? entero(f.stock) : "Sin stock"}</td>
              </tr>
            );
          })}
        </tbody>
        {filas.length > 1 && (
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <th scope="row" className="py-1.5 pr-2 text-left">
                Todas
              </th>
              <td className="py-1.5 pl-2 text-right tabular-nums">{entero(total.netas30)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{entero(total.netasTotal)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{entero(total.stock)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      <p className="m-0 text-xs text-muted-foreground">Netas = lo que salió − lo devuelto (en Dropi también se restan cancelaciones y rechazos). Incluye las variantes del producto.</p>
    </div>
  );
}
