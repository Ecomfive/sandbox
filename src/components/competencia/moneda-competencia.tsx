"use client";

// La moneda del catálogo de Dropi que se está mirando (29 oct 2026, Análisis de competencia de Costa Rica): Panamá en dólares, Costa
// Rica en colones (Dropi Costa Rica da 5.499, no 10.75). La página la pone una vez (`MonedaCompetencia`) y cada pieza la toma con
// `useMonedaCompetencia`; fuera de la página (la ficha de un producto) queda en dólares, como antes.
import { createContext, useContext, type ReactNode } from "react";
import { precioEn } from "@/lib/competencia/analisis";

const Contexto = createContext("USD");

export function MonedaCompetencia({ moneda, children }: { moneda: string; children: ReactNode }) {
  return <Contexto.Provider value={moneda}>{children}</Contexto.Provider>;
}

/** La moneda («USD», «CRC») y cómo escribir un precio en ella. */
export function useMonedaCompetencia(): { moneda: string; precio: (n: number | null) => string } {
  const moneda = useContext(Contexto);
  return { moneda, precio: (n: number | null) => precioEn(n, moneda) };
}
