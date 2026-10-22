"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AccionesActividad } from "@/lib/comentarios/tipos";

const Contexto = createContext<AccionesActividad | null>(null);

/** Le da a la Actividad (comentarios, archivos, reacciones) las acciones del servidor del módulo que la usa. */
export function ProveedorAccionesActividad({ acciones, children }: { acciones: AccionesActividad; children: ReactNode }) {
  return <Contexto.Provider value={acciones}>{children}</Contexto.Provider>;
}

export function useAccionesActividad(): AccionesActividad {
  const a = useContext(Contexto);
  if (!a) throw new Error("La Actividad necesita un ProveedorAccionesActividad con las acciones de su módulo.");
  return a;
}
