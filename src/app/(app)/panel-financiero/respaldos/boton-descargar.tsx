"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { DescargarIcon } from "@/lib/nav-icons";
import { enlaceRespaldo, verificarRespaldoAhora } from "./actions";

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

/** Comprueba que el respaldo se pueda restaurar: descarga cada archivo y cuenta sus filas. */
export function BotonVerificarRespaldo({ carpeta }: { carpeta: string }) {
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        empezar(async () => {
          const r = await verificarRespaldoAhora(carpeta);
          if ("error" in r) mostrarToast(r.error, "destructive");
          else if (r.ok) mostrarToast("Verificado: el respaldo se puede restaurar");
          else mostrarToast(r.faltan ? `Faltan ${r.faltan} tablas: vuelve a pulsar «Verificar»` : `${r.problemas} tablas con problemas`, r.faltan ? "info" : "destructive");
          router.refresh();
        })
      }
      className={`rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
    >
      {pendiente ? "Verificando…" : "Verificar"}
    </button>
  );
}
