import Link from "next/link";
import type { ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { claseAccionAF4 } from "./estilos-af4";

/** Un eje con barras: el ícono de «todavía no hay cifras». */
function IconoSinDatos() {
  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M8 40h32" />
      <path d="M14 34v-8M22 34V18M30 34v-12M38 34V12" strokeDasharray="3 3" />
    </svg>
  );
}

/**
 * Estado vacío de una página o un bloque financiero: qué falta y, si se puede resolver, el botón que lleva a hacerlo
 * («Importar el libro», «Correr la migración 0915»). Reemplaza el `EstadoVacio` suelto en las páginas del Portal AF4.
 */
export function EstadoVacioAF4({
  titulo,
  children,
  accion,
  compacto = false,
}: {
  /** Lo que no hay, en una línea: «Todavía no hay movimientos en este período». */
  titulo: string;
  /** Qué hacer, si hace falta decirlo (una línea). */
  children?: ReactNode;
  accion?: { href: string; etiqueta: string };
  /** Dentro de un bloque (menos alto). */
  compacto?: boolean;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-control bg-card text-center ${
        compacto ? "px-4 py-6" : "px-6 py-12"
      }`}
    >
      <IconoSinDatos />
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      {children && <p className="max-w-prose text-sm text-muted-foreground">{children}</p>}
      {accion && (
        <Link href={accion.href} className={`${claseAccionAF4} mt-1 ${anilloFoco}`}>
          {accion.etiqueta}
        </Link>
      )}
    </div>
  );
}

/** Lo que dibuja `loading.tsx` de una página financiera: la barra de contexto, los KPIs, la gráfica y la tabla. */
export function CargandoAF4({ kpis = 5, grafica = true, filas = 12, columnas = 8 }: { kpis?: number; grafica?: boolean; filas?: number; columnas?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      {kpis > 0 && (
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} className="min-w-0 flex-[1_1_13rem] rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2.5 h-7 w-32" />
              <Skeleton className="mt-2 h-3 w-28" />
            </div>
          ))}
        </div>
      )}
      {grafica && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-muted px-4 py-2.5">
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex h-64 items-end gap-3 p-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="flex-1" />
            ))}
          </div>
        </div>
      )}
      {filas > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex gap-4 border-b border-border bg-muted px-4 py-2.5">
            {Array.from({ length: columnas }).map((_, i) => (
              <Skeleton key={i} className={`h-3 ${i === 0 ? "w-40 flex-none" : "flex-1"}`} />
            ))}
          </div>
          {Array.from({ length: filas }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-border/60 px-4 py-2.5 last:border-0">
              {Array.from({ length: columnas }).map((_, j) => (
                <Skeleton key={j} className={`h-3 ${j === 0 ? "w-40 flex-none" : "flex-1"}`} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
