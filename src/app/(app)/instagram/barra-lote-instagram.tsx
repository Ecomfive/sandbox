"use client";

import { BotonDescargar } from "@/components/tabla/boton-descargar";
import { anilloFoco } from "@/components/ui/field";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { Tooltip } from "@/components/ui/tooltip";
import { CerrarIcon, EnlaceIcon, PapeleraIcon } from "@/lib/nav-icons";
import { DEF_INSTAGRAM, numeroInstagram, type FilaInstagram } from "./def-instagram";

const botonBarra = `inline-flex min-h-8 items-center gap-1.5 !rounded-md border border-border bg-card px-2.5 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`;

/**
 * La barra de las capturas marcadas en la lista (fija abajo, como en Retiros y Compras): dice cuántas hay, deja unir dos, eliminarlas,
 * descargar solo lo marcado y quitar la selección. Así no hay que abrir la ficha de cada una. «Unir» solo se enciende con exactamente
 * dos; la unión y la eliminación piden confirmación (las hace la lista, que conoce los datos).
 */
export function BarraLoteInstagram({ filas, trabajo, alUnir, alEliminar, alQuitar }: { filas: FilaInstagram[]; trabajo: "unir" | "eliminar" | null; alUnir: () => void; alEliminar: () => void; alQuitar: () => void }) {
  const ocupada = trabajo !== null;
  const cantidad = `${filas.length} ${filas.length === 1 ? "seleccionada" : "seleccionadas"}`;
  return (
    <div
      role="region"
      aria-label="Capturas seleccionadas"
      className="sticky bottom-4 z-30 mx-auto my-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-control bg-card px-3 py-2 text-sm shadow-lg"
    >
      <p role="status" className="m-0 font-medium tabular-nums">
        {cantidad}
      </p>
      <Tooltip texto={filas.length === 2 ? `Unir ${numeroInstagram(filas[0].numero)} y ${numeroInstagram(filas[1].numero)}` : "Marca dos capturas para unirlas"}>
        <button type="button" onClick={alUnir} disabled={ocupada || filas.length !== 2} aria-label="Unir las dos capturas seleccionadas" className={botonBarra}>
          <EnlaceIcon className="h-4 w-4" aria-hidden="true" />
          Unir
        </button>
      </Tooltip>
      <Tooltip texto="Eliminar las seleccionadas">
        <button type="button" onClick={alEliminar} disabled={ocupada} aria-label={`Eliminar ${filas.length === 1 ? "la captura seleccionada" : `las ${filas.length} capturas seleccionadas`}`} className={`${botonBarra} text-destructive`}>
          <PapeleraIcon className="h-4 w-4" aria-hidden="true" />
          Eliminar
        </button>
      </Tooltip>
      {trabajo && (
        <div className="min-w-56">
          <ProgresoEstimado compacta pasos={[trabajo === "unir" ? "Uniendo las capturas" : "Eliminando las capturas y sus archivos"]} estimadoMs={trabajo === "unir" ? 2500 : Math.max(2000, filas.length * 900)} etiqueta={trabajo === "unir" ? "Uniendo las dos capturas" : "Eliminando las capturas seleccionadas"} />
        </div>
      )}
      <BotonDescargar def={DEF_INSTAGRAM} filas={filas} nombreFilas="capturas" ayuda="Descargar seleccionadas" />
      <Tooltip texto="Quitar selección">
        <button type="button" onClick={alQuitar} aria-label="Quitar la selección" className={`flex min-h-8 min-w-8 items-center justify-center !rounded-md text-muted-foreground hover:bg-muted ${anilloFoco}`}>
          <CerrarIcon className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}
