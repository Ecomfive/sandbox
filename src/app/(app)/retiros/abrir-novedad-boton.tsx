"use client";

import { useTransition } from "react";
import { reabrirRetiro } from "./actions";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CheckIcon } from "@/lib/nav-icons";

/** Quita la novedad y vuelve a dejar "abierto" el retiro — solo aparece en la fila de acciones de
 * la ficha cuando el retiro está en novedad. Sin confirmación: es una acción reversible (se puede
 * volver a marcar en novedad desde "Modificar"), igual que Desactivar en Cuentas destino. */
export function AbrirNovedadBoton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();

  function alHacerClic() {
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      try {
        await reabrirRetiro(formData);
      } catch (err) {
        mostrarToast(err instanceof Error ? err.message : "No se pudo abrir el retiro.", "destructive");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={alHacerClic}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 rounded-md border border-success/30 px-3 py-2 text-sm font-medium text-success hover:bg-success-soft disabled:opacity-50 ${anilloFoco}`}
    >
      <CheckIcon className="h-4 w-4" />
      {pending ? "Abriendo..." : "Abrir"}
    </button>
  );
}
