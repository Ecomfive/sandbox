"use client";

import { createContext, useContext, type ReactNode } from "react";
import { montoDePais, simboloDePais, simboloDolarEn } from "@/lib/moneda/simbolo";

/** El código del país de la barra de arriba («PA», «CR», «MX»), para que cada monto lleve el símbolo de su moneda (lo provee el layout de `(app)`). */
const PaisContext = createContext<string>("PA");

export function ProveedorPais({ codigo, children }: { codigo: string; children: ReactNode }) {
  return <PaisContext.Provider value={codigo}>{children}</PaisContext.Provider>;
}

/** El país de la barra de arriba. */
export const useCodigoPais = (): string => useContext(PaisContext);

/** El símbolo de la moneda del país de la barra de arriba («$», «₡», «MX$»), para el prefijo de un campo de monto. */
export const useSimboloPais = (): string => simboloDePais(useContext(PaisContext));

/** Cómo se escribe el dólar en el país de la barra de arriba: «$» o, donde no se usa, «US$». */
export const useSimboloDolar = (): string => simboloDolarEn(useContext(PaisContext));

/** Da formato a un monto en la moneda del país de la barra de arriba. */
export function useMontoPais(): (v: number | null | undefined) => string {
  const codigo = useContext(PaisContext);
  return (v) => montoDePais(v, codigo);
}
