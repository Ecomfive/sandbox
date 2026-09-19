/** Bloque animado que ocupa el lugar de un dato mientras carga. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

/** Imita una grilla de KpiCard mientras se resuelve la consulta. */
export function SkeletonKpiGrid({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="min-w-0 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Imita una tabla con encabezado y filas mientras se resuelve la consulta. */
export function SkeletonTable({ filas = 5, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex gap-4 border-b border-border bg-muted px-4 py-2.5">
        {Array.from({ length: columnas }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-border/60 px-4 py-3 last:border-0">
          {Array.from({ length: columnas }).map((_, j) => (
            <Skeleton key={j} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
