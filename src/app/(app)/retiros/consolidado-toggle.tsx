"use client";

import { useTransition } from "react";
import { alternarConsolidado } from "./actions";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";

/** Bandera manual de seguimiento, independiente del estado del retiro.
 * `relative z-10` es necesario porque la fila entera es un enlace estirado
 * (Link con after:absolute/inset-0) — sin eso, el clic caería en el enlace. */
export function ConsolidadoToggle({ id, consolidado }: { id: string; consolidado: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Tooltip texto={consolidado ? "Marcar como pendiente" : "Marcar como consolidado"}>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const formData = new FormData();
          formData.set("id", id);
          formData.set("consolidado", String(!consolidado));
          startTransition(() => {
            alternarConsolidado(formData);
          });
        }}
        className={`relative z-10 rounded-full disabled:opacity-50 ${anilloFoco}`}
      >
        <Badge tone={consolidado ? "success" : "warning"}>{consolidado ? "Consolidado" : "Pendiente"}</Badge>
      </button>
    </Tooltip>
  );
}
