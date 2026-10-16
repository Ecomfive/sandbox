"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { CheckIcon } from "@/lib/nav-icons";
import { marcarManualLeido } from "../../mi-puesto/actions";

/** «Marcar como leído» al final de un manual. Si el manual cambió después de leerlo, se vuelve a ofrecer. */
export function BotonLeido({ manualId, estado }: { manualId: string; estado: "hecho" | "pendiente" | "desactualizado" }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  if (estado === "hecho")
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
        <CheckIcon className="h-4 w-4 text-success" />
        Leído
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            const r = await marcarManualLeido(manualId).catch(() => ({ error: "No se pudo marcar como leído." }));
            mostrarToast(r.error ?? "Marcado como leído", r.error ? "destructive" : undefined);
          })
        }
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50"
      >
        <CheckIcon className="h-4 w-4" />
        {pendiente ? "Guardando..." : "Marcar como leído"}
      </button>
      {estado === "desactualizado" && (
        <span className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
          Actualizado desde que lo leíste
        </span>
      )}
    </div>
  );
}
