"use client";

import { useId, useState } from "react";
import { anilloFoco, labelClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { calcularMargen, leerMonto } from "@/lib/publicaciones/calculadora";
import type { FilaPublicacion } from "./def-publicaciones";
import { useMoneda } from "./moneda-contexto";

/**
 * La confirmación de «Republicar» (27 oct 2026, pedido de Hernán: el 11446 salió con el precio viejo porque nadie lo cambió). Antes de
 * dejarlo para «Aplicar en Dropi» pide el **precio de venta del producto nuevo** (empieza con el de hoy) y muestra su margen; si se deja
 * igual, lo dice. Ese precio va al producto nuevo en Dropi (precio y sugerido) y a la publicación nueva del sistema.
 */
export function ConfirmarRepublicar({ p, alCerrar, alConfirmar, enviando }: { p: FilaPublicacion; alCerrar: () => void; alConfirmar: (precio: number) => void; enviando: boolean }) {
  const id = useId();
  // En la moneda del país (Costa Rica en colones).
  const { monto: usd, simbolo } = useMoneda();
  const [texto, setTexto] = useState(p.precioVenta === null ? "" : p.precioVenta.toFixed(2));
  const precio = leerMonto(texto);
  const valido = precio !== null && precio > 0;
  const mismo = valido && p.precioVenta !== null && Math.abs(precio - p.precioVenta) < 0.005;
  const r = valido ? calcularMargen({ costo: p.costoMercancia ?? 0, fulfillment: p.fulfillment ?? 0, precio }) : null;
  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Republicar en Dropi" ancho="sm">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valido && !enviando) alConfirmar(precio);
        }}
      >
        <p className="m-0 text-sm text-foreground-soft">
          Se va a crear en Dropi una publicación nueva igual a <span className="font-medium text-foreground">{p.nombre}</span> (datos, fotos y stock) y la del ID {p.dropiId} queda
          archivada y sin stock. Se hace al pulsar «Aplicar en Dropi» con Dropi abierto.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-precio`} className={labelClass}>
            Precio de venta del producto nuevo
          </label>
          <span className="flex items-center gap-1 rounded-md border border-border-control bg-card px-3 focus-within:border-foreground focus-within:ring-2 focus-within:ring-foreground">
            <span aria-hidden="true" className="text-sm text-muted-foreground">
              {simbolo}
            </span>
            <input
              id={`${id}-precio`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              inputMode="decimal"
              required
              data-enfocar
              aria-invalid={!valido ? true : undefined}
              aria-describedby={`${id}-nota`}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm tabular-nums outline-none"
            />
          </span>
          <p id={`${id}-nota`} className="m-0 text-xs text-muted-foreground">
            {p.precioVenta !== null ? `Hoy está en ${usd(p.precioVenta)}. ` : ""}
            {r ? (
              <>
                Con este precio: utilidad <span className="font-medium text-foreground tabular-nums">{usd(r.utilidad)}</span>, margen{" "}
                <span className="font-medium text-foreground tabular-nums">{Math.round(r.margen * 100)} %</span>.
              </>
            ) : (
              "Pon un precio mayor que cero."
            )}
          </p>
          {mismo && <p className="m-0 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs font-medium text-warning">Se republica con el mismo precio. Si había que cambiarlo, cámbialo aquí.</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={alCerrar} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
            Cancelar
          </button>
          <button type="submit" disabled={!valido || enviando} className={`inline-flex min-h-10 items-center rounded-lg bg-primario px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}>
            {enviando ? "Dejando pendiente…" : valido ? `Republicar a ${usd(precio)}` : "Republicar"}
          </button>
        </div>
      </form>
    </Ventana>
  );
}
