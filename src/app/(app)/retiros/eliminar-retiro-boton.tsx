"use client";

import { useState, useTransition } from "react";
import { eliminarRetiro } from "./actions";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { PapeleraIcon } from "@/lib/nav-icons";

/** Ícono de eliminar por fila en Conciliación de Retiros — mismo patrón que EliminarCuentaBoton
 * en cuentas destino: confirm() antes de borrar, y `relative z-10` + stopPropagation porque la
 * fila entera es un enlace estirado (ver ConsolidadoToggle/EstadoSelect). */
export function EliminarRetiroBoton({ id, correlativo }: { id: string; correlativo: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const numero = `#${String(correlativo).padStart(4, "0")}`;

  function alHacerClic(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`¿Está seguro de que desea eliminar el retiro ${numero}?`)) return;
    setError(null);
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const resultado = await eliminarRetiro(formData);
      if (resultado?.error) setError(resultado.error);
    });
  }

  return (
    <span className="relative z-10 inline-block">
      <Tooltip texto="Eliminar retiro">
        <button
          type="button"
          onClick={alHacerClic}
          disabled={pending}
          aria-label={`Eliminar retiro ${numero}`}
          className={`rounded p-1.5 text-muted-foreground hover:bg-destructive-soft hover:text-destructive disabled:opacity-50 ${anilloFoco}`}
        >
          <PapeleraIcon className="h-4 w-4" />
        </button>
      </Tooltip>
      {error && (
        <span
          role="alert"
          className="absolute top-full right-0 z-10 mt-1 w-56 rounded-md border border-destructive/30 bg-card p-2 text-xs text-destructive shadow-md"
        >
          {error}
        </span>
      )}
    </span>
  );
}
