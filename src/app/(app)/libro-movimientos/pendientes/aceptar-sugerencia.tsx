"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { CheckIcon } from "@/lib/nav-icons";
import type { FilaPendiente } from "@/lib/finanzas/cargar-pendientes";
import { clasificarMovimientos } from "../clasificar-actions";

/** Acepta con un clic la sugerencia de un movimiento (queda corregido a mano y sale de la bandeja). */
export function AceptarSugerencia({ fila }: { fila: FilaPendiente }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const texto = `Aceptar ${[fila.sugTienda, fila.sugTipo].filter(Boolean).join(" · ")}`;
  return (
    <Tooltip texto="Aceptar sugerencia">
      <button
        type="button"
        aria-label={`${texto} para «${fila.descripcion.slice(0, 40)}»`}
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await clasificarMovimientos([{ id: fila.id, unidad_id: fila.sugTiendaId, tipo_id: fila.sugTipoId }]).catch(() => ({ error: "Se cortó la conexión." }));
            if ("error" in r) mostrarToast(r.error, "destructive");
            else {
              mostrarToast("Clasificado");
              router.refresh();
            }
          })
        }
        className={`flex min-h-7 min-w-7 shrink-0 items-center justify-center !rounded-md border border-border bg-card hover:bg-muted disabled:opacity-40 ${anilloFoco}`}
      >
        <CheckIcon className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
