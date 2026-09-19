"use client";

import { useTransition } from "react";
import { alternarConsolidado } from "./actions";
import { Badge } from "@/components/ui/badge";

/** Bandera manual de seguimiento, independiente del estado del retiro.
 * `relative z-10` es necesario porque la fila entera es un enlace estirado
 * (Link con after:absolute/inset-0) — sin eso, el clic caería en el enlace. */
export function ConsolidadoToggle({ id, consolidado }: { id: string; consolidado: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
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
      className="relative z-10 disabled:opacity-50"
      title={consolidado ? "Clic para marcar como pendiente" : "Clic para marcar como consolidado"}
    >
      <Badge tone={consolidado ? "success" : "warning"}>{consolidado ? "Consolidado" : "Pendiente"}</Badge>
    </button>
  );
}
