"use client";

import { useTransition } from "react";
import { eliminarCuentaRetiro } from "./actions";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { PapeleraIcon } from "@/lib/nav-icons";
import { mensajeErrorAlEliminar } from "@/lib/retiros/errores";

/** Eliminar una cuenta destino. Si no se puede, el error sale como aviso (toast), no como una caja pegada a la fila:
 * dentro de la tabla tapaba las filas de abajo. */
export function EliminarCuentaBoton({ id, nombre }: { id: string; nombre: string }) {
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();

  function alHacerClic() {
    if (!confirm(`¿Está seguro de que desea eliminar la cuenta "${nombre}"?`)) return;
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const resultado = await eliminarCuentaRetiro(formData).catch(() => ({ error: "Inténtalo de nuevo." }));
      if (resultado?.error) mostrarToast(mensajeErrorAlEliminar(`la cuenta "${nombre}"`, resultado.error), "destructive");
    });
  }

  return (
    <Tooltip texto="Eliminar cuenta">
      <button
        type="button"
        onClick={alHacerClic}
        disabled={pending}
        aria-label={`Eliminar ${nombre}`}
        className={`rounded p-1.5 text-muted-foreground hover:bg-destructive-soft hover:text-destructive disabled:opacity-50 ${anilloFoco}`}
      >
        <PapeleraIcon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}
