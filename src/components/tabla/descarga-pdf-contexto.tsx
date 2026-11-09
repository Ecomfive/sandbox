"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Si la persona puede bajar en PDF lo que ve en una tabla (`PUEDEN_DESCARGAR_PDF`; lo pone el layout de `(app)`). */
const DescargaPdfContext = createContext(false);

export function ProveedorDescargaPdf({ puede, children }: { puede: boolean; children: ReactNode }) {
  return <DescargaPdfContext.Provider value={puede}>{children}</DescargaPdfContext.Provider>;
}

export const usePuedeDescargarPdf = () => useContext(DescargaPdfContext);
