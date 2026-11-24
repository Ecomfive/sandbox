"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * Una tarjeta del módulo que se pliega y se despliega (24 nov 2026, pedido de Alcides: «que se puedan desplegar y volver a replegar»). El encabezado entero es el botón (`aria-expanded`, `aria-controls`), con la misma franja gris de
 * `TarjetaMeta`; plegada deja a la vista su `resumen` (una línea con lo más importante) para no tener que abrirla para saber de qué trata. Lo de adentro no se dibuja mientras está plegada: la página pesa menos.
 */
export function SeccionPlegable({ titulo, resumen, derecha, abierta = true, icono, sinRelleno = false, children }: { titulo: string; resumen?: ReactNode; derecha?: ReactNode; abierta?: boolean; icono?: ReactNode; /** El contenido llega hasta el borde (una tabla). */ sinRelleno?: boolean; children: ReactNode }) {
  const [visible, setVisible] = useState(abierta);
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted px-4 py-1.5" style={visible ? undefined : { borderBottomWidth: 0 }}>
        <button
          type="button"
          id={`${id}-t`}
          aria-expanded={visible}
          aria-controls={`${id}-c`}
          onClick={() => setVisible((v) => !v)}
          className="-ml-1 flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" className={`shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${visible ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
          {icono}
          <span className="truncate">{titulo}</span>
          {!visible && resumen && <span className="ml-1 hidden min-w-0 truncate text-xs font-normal text-muted-foreground sm:inline">{resumen}</span>}
        </button>
        {derecha && <div className="text-xs text-muted-foreground">{derecha}</div>}
      </div>
      {visible && (
        <div id={`${id}-c`} className={sinRelleno ? "" : "p-4"}>
          {children}
        </div>
      )}
    </section>
  );
}
