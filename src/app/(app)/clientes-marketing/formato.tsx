// Piezas de presentación propias de Clientes y marketing. Los números salen del formato único del Portal AF4
// (`@/lib/af4/formato`: `dinero`, `dinero2`, `fraccion`, `veces`, `entero`); aquí solo queda lo que no es un número.

import type { ReactNode } from "react";

/** «1 mes», «3 meses»; null → «—». */
export const meses = (v: number | null) => (v === null ? "—" : `${v} ${v === 1 ? "mes" : "meses"}`);

/**
 * Un valor con un punto rojo delante cuando está en alerta, y con «≈» cuando es una estimación (sale de cohortes
 * anteriores porque las del período todavía no maduran).
 */
export function ConPunto({ alerta, estimado, children }: { alerta?: boolean; estimado?: boolean; children: ReactNode }) {
  if (!alerta && !estimado) return <>{children}</>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {alerta && (
        <>
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          <span className="sr-only">En alerta: </span>
        </>
      )}
      {estimado && (
        <>
          <span aria-hidden="true" className="text-muted-foreground">≈</span>
          <span className="sr-only">Aproximado: </span>
        </>
      )}
      {children}
    </span>
  );
}
