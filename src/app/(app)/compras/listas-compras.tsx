"use client";

import { createContext, useContext, type ReactNode } from "react";
import { AGENTES_ENVIO, PROVEEDORES_COMPRA } from "./def-compras";

/**
 * Los proveedores y agentes de envío que se ofrecen (mejora 52): los de la lista fija más los que ya se usaron en alguna compra.
 * Uno nuevo se agrega escribiéndolo en la celda o en la ficha, como una tienda, y desde ahí queda para todas.
 */
interface Listas {
  proveedores: string[];
  agentes: string[];
}
const Contexto = createContext<Listas>({ proveedores: [], agentes: [] });

/** La lista fija primero y luego lo que ya se usó, sin repetir (sin importar mayúsculas), en orden alfabético. */
export function juntarLista(fija: readonly { valor: string }[], usados: (string | null)[]): string[] {
  const vistos = new Set(fija.map((f) => f.valor.toLowerCase()));
  const extra = [...new Set(usados.map((u) => u?.trim()).filter((u): u is string => !!u && !vistos.has(u.toLowerCase())))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
  return [...fija.map((f) => f.valor), ...extra];
}

export function ProveedorListasCompras({ proveedores, agentes, children }: { proveedores: (string | null)[]; agentes: (string | null)[]; children: ReactNode }) {
  return (
    <Contexto.Provider value={{ proveedores: juntarLista(PROVEEDORES_COMPRA, proveedores), agentes: juntarLista(AGENTES_ENVIO, agentes) }}>
      {children}
    </Contexto.Provider>
  );
}

export const useListasCompras = () => useContext(Contexto);
