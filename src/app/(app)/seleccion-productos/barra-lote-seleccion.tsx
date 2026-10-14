"use client";

import { anilloFoco } from "@/components/ui/field";
import { CerrarIcon, EstadoIcon } from "@/lib/nav-icons";
import type { FilaSeleccion } from "./def-seleccion";
import { SelectorEstado } from "./selector-estado";

/**
 * La barra de varias filas marcadas (fija abajo, como en Compras y en ClickUp): cuántas hay, mover todas a un estado de una
 * vez y quitar la selección. La selección queda para seguir con otra acción.
 */
export function BarraLoteSeleccion({
  filas,
  alQuitar,
  alCambiarEstado,
  guardando,
}: {
  filas: FilaSeleccion[];
  alQuitar: () => void;
  alCambiarEstado: (estado: string) => void;
  guardando: boolean;
}) {
  const cantidad = `${filas.length} ${filas.length === 1 ? "fila seleccionada" : "filas seleccionadas"}`;
  return (
    <div
      role="region"
      aria-label="Filas seleccionadas"
      aria-busy={guardando}
      className="sticky bottom-4 z-30 mx-auto my-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-border-control bg-card px-3 py-2 text-sm shadow-lg"
    >
      <span className="font-medium tabular-nums">{cantidad}</span>
      <SelectorEstado estado={null} aria={`Cambiar el estado de ${cantidad}`} puedeEscribir alCambiar={alCambiarEstado}>
        <span className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1">
          <EstadoIcon className="h-4 w-4" />
          Estado
        </span>
      </SelectorEstado>
      <button type="button" onClick={alQuitar} aria-label="Quitar la selección" className={`flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted ${anilloFoco}`}>
        <CerrarIcon className="h-4 w-4" />
        Quitar selección
      </button>
    </div>
  );
}
