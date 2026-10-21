"use client";

import { labelClassSm } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { conEmoji } from "./def-compras";
import { useEstimacionEnvio } from "./estimacion-envio";

/**
 * La planificación en la ficha de una compra: no se escribe, se calcula sola con la fecha de envío, la vía y el país del mismo
 * formulario (lo que tardaron los envíos anteriores de ese país por esa vía; ver `EstimacionEnvio`). Sin fecha de envío se ve la
 * que tenía (las de ClickUp).
 */
export function PlanificacionAutomatica({ planificacion, fechaEnvio }: { planificacion: string | null; fechaEnvio: string | null }) {
  const { estimacion, sinFecha, calculando } = useEstimacionEnvio();

  // Una compra que nunca tuvo fecha de envío conserva la planificación que traía; si se le quita la fecha, queda sin ella.
  const valor = estimacion?.planificacion ?? (sinFecha && !fechaEnvio ? planificacion : null);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={labelClassSm}>{conEmoji("planificacion", "Planificación")}</span>
      <output aria-live="polite" className="flex min-h-9 flex-col justify-center rounded-md border border-dashed border-border-control px-3 py-1.5 text-sm">
        <span className={valor ? "font-medium" : "text-muted-foreground"}>{calculando && !valor ? "Calculando…" : (valor ?? "Con la fecha de envío")}</span>
        {estimacion && (
          <span className="text-xs text-muted-foreground">
            Llega ~{formatearFecha(estimacion.llegadaEstimada)} · {estimacion.explicacion}
          </span>
        )}
      </output>
    </div>
  );
}
