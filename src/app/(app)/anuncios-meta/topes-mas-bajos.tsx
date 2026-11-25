"use client";

import Link from "next/link";
import { cpa, dolares } from "@/lib/meta-ads/metricas";
import { estadoFrenteAGuia, type EstadoDeGuia } from "@/lib/meta-ads/limite";
import type { ProductoVista } from "@/lib/meta-ads/vistas";
import { SeccionPlegable } from "./plegable";

const ESTADO: Record<EstadoDeGuia, { texto: string; clase: string; orden: number }> = {
  apagar: { texto: "Ya pasa del punto de apagado", clase: "bg-destructive-soft text-destructive", orden: 0 },
  vigilar: { texto: "Para vigilar", clase: "bg-warning-soft text-warning", orden: 1 },
  bien: { texto: "Va por debajo", clase: "bg-success-soft text-success", orden: 2 },
  sin_compras: { texto: "Sin compras en el periodo", clase: "bg-muted text-muted-foreground", orden: 3 },
};

/**
 * Los productos con el tope más bajo porque envían o entregan menos (25 nov 2026, pedido de Alcides: «que lo indique: desde cuándo empezar a verlo o apagarlo»): por qué, desde qué CPA vigilar cada uno y desde cuál apagarlo, y dónde
 * está hoy con el periodo elegido. Primero lo que ya pasó. No se dibuja si ninguno tiene el tope ajustado.
 */
export function TopesMasBajos({ productos, abierta = true }: { productos: ProductoVista[]; abierta?: boolean }) {
  const lista = productos
    .flatMap((p) => (p.guiaTope ? [{ p, g: p.guiaTope, estado: estadoFrenteAGuia(p.r, p.guiaTope) }] : []))
    .sort((a, b) => ESTADO[a.estado].orden - ESTADO[b.estado].orden || b.p.r.gasto - a.p.r.gasto);
  if (lista.length === 0) return null;
  const pasados = lista.filter((x) => x.estado === "apagar").length;
  const porVigilar = lista.filter((x) => x.estado === "vigilar").length;
  const resumen = [pasados ? `${pasados} sobre el punto de apagado` : "", porVigilar ? `${porVigilar} para vigilar` : ""].filter(Boolean).join(" · ") || `${lista.length} productos`;
  return (
    <SeccionPlegable titulo="Productos con tope más bajo: desde cuándo vigilar y apagar" abierta={abierta} resumen={resumen} derecha={<span className="hidden sm:inline">{resumen}</span>} sinRelleno>
      <ul role="list" className="m-0 flex list-none flex-col divide-y divide-border p-0">
        {lista.map(({ p, g, estado }) => {
          const costo = cpa(p.r);
          return (
            <li key={p.clave} className="grid items-center gap-x-4 gap-y-1.5 px-4 py-3 md:grid-cols-[minmax(0,1.4fr)_auto_auto_minmax(0,1fr)]">
              <div className="min-w-0">
                <Link href={`/anuncios-meta/productos?abrir=${encodeURIComponent(p.clave)}`} className="block truncate text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                  {p.nombre}
                </Link>
                <p className="m-0 text-xs text-muted-foreground">
                  {g.causa}: {g.motivo}
                </p>
              </div>
              <p className="m-0 text-xs tabular-nums">
                <span className="text-muted-foreground">Vigilar desde </span>
                <span className="text-sm font-semibold">{dolares(g.vigilar)}</span>
              </p>
              <p className="m-0 text-xs tabular-nums">
                <span className="text-muted-foreground">Apagar desde </span>
                <span className="text-sm font-semibold text-destructive">{dolares(g.apagar)}</span>
              </p>
              <p className="m-0 flex flex-wrap items-center gap-2 text-xs tabular-nums md:justify-end">
                <span>{costo === null ? "Sin CPA" : `CPA del periodo ${dolares(costo)}`}</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${ESTADO[estado].clase}`}>{ESTADO[estado].texto}</span>
              </p>
            </li>
          );
        })}
      </ul>
      <p className="m-0 border-t border-border px-4 py-2 text-xs text-muted-foreground">Con el tope general de $10 se vigila desde $9.00 y se apaga desde $12.00. Se apaga si el CPA de 7 días llega al punto de apagar y en 4 días no baja; también antes, si ya pasó del tope y ningún anuncio vende por debajo del punto de vigilar.</p>
    </SeccionPlegable>
  );
}
