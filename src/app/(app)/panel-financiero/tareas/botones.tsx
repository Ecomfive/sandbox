"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { CheckIcon } from "@/lib/nav-icons";
import type { ClaveTarea } from "@/lib/tareas/definiciones";
import { correrTareaAhora, marcarAlertaVista } from "./actions";

/** «Correr ahora» de una tarea: espera el resultado y lo muestra en un aviso. */
export function BotonCorrer({ clave, titulo }: { clave: ClaveTarea; titulo: string }) {
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pendiente}
      aria-label={`Correr ahora: ${titulo}`}
      onClick={() =>
        empezar(async () => {
          const r = await correrTareaAhora(clave).catch(() => ({ error: "Se cortó la conexión." }) as { error: string });
          if ("error" in r && r.error) mostrarToast(r.error, "destructive");
          else mostrarToast("resumen" in r && r.resumen ? r.resumen.slice(0, 140) : "Listo");
          router.refresh();
        })
      }
      className={`inline-flex h-8 shrink-0 items-center rounded-md border border-border-control bg-card px-3 text-sm hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
    >
      {pendiente ? "Corriendo…" : "Correr ahora"}
    </button>
  );
}

/** Marca una alerta como vista (deja de salir en el Panel). */
export function BotonVista({ id, mensaje }: { id: string; mensaje: string }) {
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  return (
    <Tooltip texto="Marcar como vista">
      <button
        type="button"
        disabled={pendiente}
        aria-label={`Marcar como vista: ${mensaje}`}
        onClick={() =>
          empezar(async () => {
            const r = await marcarAlertaVista(id).catch(() => ({ error: "Se cortó la conexión." }));
            if (r.error) mostrarToast(r.error, "destructive");
            router.refresh();
          })
        }
        className={`flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
      >
        <CheckIcon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}
