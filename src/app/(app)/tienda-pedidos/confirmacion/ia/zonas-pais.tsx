"use client";

import { createContext, useContext, type ReactNode } from "react";
import { nombresDeZona, permiteAdelanto, zonasDePais } from "@/lib/confirmacion-ia/zonas";

const Contexto = createContext<string | null>(null);

/** El país de la pantalla de Confirmación con IA: de él salen los nombres de las zonas (Costa Rica usa CIUDAD-GAM e INTERIOR-ZONAS-ALEJADAS) y si hay pago por adelantado (Costa Rica no). */
export function ProveedorZonasPais({ codigoPais, children }: { codigoPais: string | null | undefined; children: ReactNode }) {
  return <Contexto.Provider value={codigoPais ?? null}>{children}</Contexto.Provider>;
}

export function useZonasPais() {
  const codigo = useContext(Contexto);
  return { codigo, nombres: nombresDeZona(codigo), zonas: zonasDePais(codigo), conAdelanto: permiteAdelanto(codigo) };
}
