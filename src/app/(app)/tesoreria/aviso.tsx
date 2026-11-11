import type { ReactNode } from "react";

/** Un aviso corto de Tesorería (falta una migración, no hay datos): caja neutra con un punto ámbar. */
export function AvisoTesoreria({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
      {children}
    </p>
  );
}
