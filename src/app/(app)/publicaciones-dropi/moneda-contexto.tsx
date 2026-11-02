"use client";

import { createContext, useContext, type ReactNode } from "react";
import { formatoEnDolares, formatoMonto, MONEDA_DOLAR, simboloMoneda, type MonedaPublicaciones } from "@/lib/publicaciones/moneda";

// La moneda del país de la barra para toda Gestión de IDs Dropi (la lista, la ficha y la calculadora): Panamá en dólares, Costa Rica en
// colones con el valor en dólares en pequeño (28 oct 2026). Fuera del proveedor, en dólares como siempre.
const Contexto = createContext<MonedaPublicaciones>(MONEDA_DOLAR);

export function ProveedorMoneda({ moneda, children }: { moneda: MonedaPublicaciones; children: ReactNode }) {
  return <Contexto.Provider value={moneda}>{children}</Contexto.Provider>;
}

/** Cómo escribir montos en la moneda del país: `monto(v)`, `enDolares(v)` (null en Panamá) y el `simbolo` de los campos. */
export function useMoneda() {
  const m = useContext(Contexto);
  return { moneda: m, monto: (v: number | null) => formatoMonto(v, m), enDolares: (v: number | null) => formatoEnDolares(v, m), simbolo: simboloMoneda(m) };
}

/** Un monto en la moneda del país y, si no es el dólar, su valor en dólares en pequeño al lado. */
export function Monto({ valor, className = "" }: { valor: number | null; className?: string }) {
  const { monto, enDolares } = useMoneda();
  const usd = enDolares(valor);
  return (
    <span className={className}>
      {monto(valor)}
      {usd && <span className="ml-1 text-xs font-normal text-muted-foreground">{usd}</span>}
    </span>
  );
}
