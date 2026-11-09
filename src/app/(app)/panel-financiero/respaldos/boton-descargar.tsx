"use client";

import { useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { DescargarIcon } from "@/lib/nav-icons";
import { enlaceRespaldo } from "./actions";

/** Descarga un archivo del respaldo con un enlace firmado de un minuto. */
export function BotonDescargarRespaldo({ ruta, tabla }: { ruta: string; tabla: string }) {
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  return (
    <Tooltip texto="Descargar tabla">
      <button
        type="button"
        disabled={pendiente}
        aria-label={`Descargar ${tabla}`}
        onClick={() =>
          empezar(async () => {
            const r = await enlaceRespaldo(ruta);
            if (r.error || !r.url) return mostrarToast(r.error ?? "No se pudo descargar.", "destructive");
            window.location.assign(r.url);
          })
        }
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 ${anilloFoco}`}
      >
        <DescargarIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
