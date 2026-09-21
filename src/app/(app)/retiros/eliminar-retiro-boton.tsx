"use client";

import { useTransition } from "react";
import { eliminarRetiro } from "./actions";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { PapeleraIcon } from "@/lib/nav-icons";
import { mensajeErrorAlEliminar } from "@/lib/retiros/errores";

/** Ícono de eliminar por fila en Conciliación de Retiros — mismo patrón que EliminarCuentaBoton en cuentas destino:
 * confirm() antes de borrar, y `relative z-10` + stopPropagation porque la fila entera es un enlace estirado (ver
 * ConsolidadoToggle/EstadoSelect). Si no se puede eliminar, el error sale como aviso (toast), no como una caja pegada
 * a la fila: dentro de la tabla tapaba las filas de abajo y sus botones. */
export function EliminarRetiroBoton({ id, correlativo }: { id: string; correlativo: number }) {
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();
  const numero = `#${String(correlativo).padStart(4, "0")}`;

  function alHacerClic(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`¿Está seguro de que desea eliminar el retiro ${numero}?`)) return;
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const resultado = await eliminarRetiro(formData).catch(() => ({ error: "Inténtalo de nuevo." }));
      if (resultado?.error) mostrarToast(mensajeErrorAlEliminar(`el retiro ${numero}`, resultado.error), "destructive");
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
    </span>
  );
}
