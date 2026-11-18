import { Pagina } from "@/components/ui/pagina";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

/**
 * Lo que se ve mientras carga una página de Gestión de tienda (18 nov 2026, velocidad: antes salía la pantalla de carga general, que no se parece a
 * estas páginas): la barra de tiendas (y el periodo), las tarjetas, un bloque opcional (la meta de Confirmación, la gráfica del Dashboard) y la tabla.
 */
export function CargandoTienda({
  barra = true,
  periodo = true,
  tarjetas = 5,
  bloque,
  filas = 8,
  columnas = 7,
  etiqueta,
}: {
  /** Si la página tiene la barra de tiendas arriba. */
  barra?: boolean;
  /** Si la página tiene selector de fechas a la derecha de la barra. */
  periodo?: boolean;
  /** Cuántas tarjetas de indicadores (0: ninguna). */
  tarjetas?: number;
  /** Alto de un bloque entre las tarjetas y la tabla (por ejemplo «h-16» o «h-[320px]»); sin él, nada. */
  bloque?: string;
  filas?: number;
  columnas?: number;
  /** Lo que lee un lector de pantalla mientras carga. */
  etiqueta: string;
}) {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <div role="status" className="contents">
        {barra && <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-36 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-20 rounded-full" />
          </div>
          {periodo && <Skeleton className="h-9 w-48 rounded-full" />}
        </div>}
        {tarjetas > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
            {Array.from({ length: tarjetas }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        )}
        {bloque && <Skeleton className={`w-full rounded-lg ${bloque}`} />}
        <SkeletonTable filas={filas} columnas={columnas} />
        <span className="sr-only">{etiqueta}</span>
      </div>
    </Pagina>
  );
}
