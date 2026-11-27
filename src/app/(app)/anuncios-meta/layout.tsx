import type { ReactNode } from "react";
import { NotasFlotantes } from "./notas-flotantes";

/**
 * Común a todas las pestañas de Anuncios Meta. Las notas flotantes (26 nov 2026, pedido de Hernán) viven aquí y no en cada página: al cambiar de pestaña la ventana de notas
 * sigue abierta y no se pierde lo que se está escribiendo. Cada página revisa su permiso; las notas, el suyo en el servidor.
 */
export default function LayoutAnunciosMeta({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <NotasFlotantes />
    </>
  );
}
