"use client";

import { useState, useTransition } from "react";
import { eliminarCuentaRetiro } from "./actions";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { PapeleraIcon } from "@/lib/nav-icons";

export function EliminarCuentaBoton({ id, nombre }: { id: string; nombre: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function alHacerClic() {
    if (!confirm(`¿Está seguro de que desea eliminar la cuenta "${nombre}"?`)) return;
    setError(null);
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const resultado = await eliminarCuentaRetiro(formData);
      if (resultado?.error) setError(resultado.error);
    });
  }

  return (
    <span className="relative">
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
      {error && (
        <span role="alert" className="absolute top-full right-0 z-10 mt-1 w-56 rounded-md border border-destructive/30 bg-card p-2 text-xs text-destructive shadow-md">
          {error}
        </span>
      )}
    </span>
  );
}
