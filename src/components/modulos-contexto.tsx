"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Los módulos que la persona puede abrir, para que un enlace a otro módulo solo se dibuje si lleva a algo suyo. */
const ModulosContext = createContext<readonly string[] | null>(null);

export function ProveedorModulos({ modulos, children }: { modulos: readonly string[] | null; children: ReactNode }) {
  return <ModulosContext.Provider value={modulos}>{children}</ModulosContext.Provider>;
}

/** Si la persona puede abrir ese módulo. Fuera del proveedor (sin sesión) no se esconde nada. */
export function usePuedeAbrir(modulo: string): boolean {
  const modulos = useContext(ModulosContext);
  return modulos === null || modulos.includes(modulo);
}
