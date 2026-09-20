"use client";

import { useTransition } from "react";
import { alternarConsolidado } from "./actions";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";

/** Bandera manual de seguimiento, independiente del estado del retiro. Solo se cambia desde
 * la ficha del retiro (al conciliarlo) — en la tabla de Conciliación de Retiros la columna
 * "Consolidación" es de solo lectura. */
export function ConsolidadoToggle({ id, consolidado }: { id: string; consolidado: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Tooltip texto={consolidado ? "Marcar como pendiente" : "Marcar como consolidado"}>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const formData = new FormData();
          formData.set("id", id);
          formData.set("consolidado", String(!consolidado));
          startTransition(() => {
            alternarConsolidado(formData);
          });
        }}
        className={`rounded-full disabled:opacity-50 ${anilloFoco}`}
      >
        <Badge tone={consolidado ? "success" : "warning"}>{consolidado ? "Consolidado" : "Pendiente"}</Badge>
      </button>
    </Tooltip>
  );
}
