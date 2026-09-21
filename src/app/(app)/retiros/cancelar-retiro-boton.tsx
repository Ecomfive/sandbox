"use client";

import { useTransition } from "react";
import { cancelarRetiro } from "./actions";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CerrarIcon } from "@/lib/nav-icons";

/** Botón para cancelar un retiro — mismo patrón que EliminarRetiroBoton (confirm() antes de
 * enviar, useTransition, error como toast). Solo se usa como botón grande en la fila de
 * acciones de la ficha del retiro (no hay ícono suelto en la tabla para esto). */
export function CancelarRetiroBoton({ id, correlativo }: { id: string; correlativo: number }) {
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();
  const numero = `#${String(correlativo).padStart(4, "0")}`;

  function alHacerClic() {
    if (!confirm(`¿Está seguro de que desea cancelar el retiro ${numero}?`)) return;
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      try {
        await cancelarRetiro(formData);
      } catch (err) {
        mostrarToast(err instanceof Error ? err.message : `No se pudo cancelar el retiro ${numero}.`, "destructive");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={alHacerClic}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive-soft disabled:opacity-50 ${anilloFoco}`}
    >
      <CerrarIcon className="h-4 w-4" />
      {pending ? "Cancelando..." : "Cancelar"}
    </button>
  );
}
