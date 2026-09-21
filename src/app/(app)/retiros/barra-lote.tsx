"use client";

import { BotonDescargar } from "@/components/tabla/boton-descargar";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { CerrarIcon } from "@/lib/nav-icons";
import { DEF_RETIROS } from "./filtros";
import type { FilaRetiro } from "./tabla-retiros";

/**
 * Barra de los retiros que se marcaron en la tabla: dice cuántos hay seleccionados, permite descargar solo lo marcado
 * y quitar la selección. Queda fija abajo mientras la tabla está a la vista. No cambia ningún dato: el estado de un
 * retiro no se mueve desde aquí (cambia al conciliar o cancelar), y eliminar tampoco.
 */
export function BarraLote({ filas, alQuitar }: { filas: FilaRetiro[]; alQuitar: () => void }) {
  const cantidad = `${filas.length} ${filas.length === 1 ? "seleccionado" : "seleccionados"}`;

  return (
    <div
      role="region"
      aria-label="Retiros seleccionados"
      className="sticky bottom-4 z-30 mx-auto my-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-control bg-card px-3 py-2 text-sm shadow-lg"
    >
      <p role="status" className="font-medium tabular-nums">
        {cantidad}
      </p>
      <BotonDescargar def={DEF_RETIROS} filas={filas} nombreFilas="retiros" ayuda="Descargar seleccionados" />
      <Tooltip texto="Quitar selección">
        <button
          type="button"
          onClick={alQuitar}
          aria-label="Quitar la selección"
          className={`flex min-h-8 min-w-8 items-center justify-center !rounded-md text-muted-foreground hover:bg-muted ${anilloFoco}`}
        >
          <CerrarIcon className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}
