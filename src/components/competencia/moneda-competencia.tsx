"use client";

// La moneda del catálogo de Dropi que se está mirando (29 oct 2026, Análisis de competencia de Costa Rica): Panamá en dólares, Costa
// Rica en colones (Dropi Costa Rica da 5.499, no 10.75). La página la pone una vez (`MonedaCompetencia`) y cada pieza la toma con
// `useMonedaCompetencia`; fuera de la página (la ficha de un producto) queda en dólares, como antes. Lleva también el país, para las horas (6 nov 2026): la base las
// guarda en UTC y salían 5 horas adelantadas.
import { createContext, useContext, type ReactNode } from "react";
import { precioEn } from "@/lib/competencia/analisis";

const Contexto = createContext({ moneda: "USD", pais: "PA" });

export function MonedaCompetencia({ moneda, pais, children }: { moneda: string; pais: string; children: ReactNode }) {
  return <Contexto.Provider value={{ moneda, pais }}>{children}</Contexto.Provider>;
}

/** La moneda («USD», «CRC»), cómo escribir un precio en ella y el país («CR»), para las horas. */
export function useMonedaCompetencia(): { moneda: string; pais: string; precio: (n: number | null) => string } {
  const { moneda, pais } = useContext(Contexto);
  return { moneda, pais, precio: (n: number | null) => precioEn(n, moneda) };
}
