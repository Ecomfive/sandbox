"use client";

import { CheckIcon } from "@/lib/nav-icons";

/**
 * El avance real de un proceso que se hace por partes («3 de 13 videos», «mes 4 de 12»): una barra con lo hecho sobre el total, qué se está haciendo ahora y, si se puede, un botón para detenerlo.
 * Para un proceso de una sola llamada, cuya duración no se sabe, se usa `ProgresoEstimado`. Sin animación si la persona pidió menos movimiento. `terminado` la deja completa en verde.
 */
export function BarraAvance({ hecho, total, texto, etiqueta, unidad, terminado = false, alDetener, deteniendo = false }: { hecho: number; total: number; texto: string; etiqueta: string; unidad?: string; terminado?: boolean; alDetener?: () => void; deteniendo?: boolean }) {
  const fraccion = terminado ? 1 : total > 0 ? Math.min(1, hecho / total) : 0;
  const porcentaje = Math.round(fraccion * 100);
  return (
    <div aria-busy={!terminado} className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          {terminado ? (
            <CheckIcon className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-primario motion-reduce:animate-none" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          )}
          <span role="status" aria-live="polite" className="min-w-0 truncate">
            {terminado ? "Listo" : texto}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.min(hecho, total)} de {total}
            {unidad ? ` ${unidad}` : ""} · {porcentaje} %
          </span>
          {alDetener && !terminado && (
            <button type="button" onClick={alDetener} disabled={deteniendo} className="min-h-8 rounded-md border border-border-control bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60">
              {deteniendo ? "Deteniendo…" : "Detener"}
            </button>
          )}
        </span>
      </div>
      <div role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(hecho, total)} className="h-1.5 overflow-hidden rounded-full bg-border">
        <div style={{ width: `${porcentaje}%` }} className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${terminado ? "bg-success" : "bg-primario"}`} />
      </div>
    </div>
  );
}
