"use client";

import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { ImprimirIcon } from "./iconos-af4";
import { claseAccionAF4 } from "./estilos-af4";

/** Imprime la página (o la guarda en PDF desde el diálogo del navegador). El menú y la barra de arriba no salen. */
export function BotonImprimir() {
  return (
    <Tooltip texto="Imprimir la página">
      <button type="button" onClick={() => window.print()} aria-label="Imprimir la página" className={`${claseAccionAF4} ${anilloFoco}`}>
        <ImprimirIcon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}
