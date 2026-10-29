"use client";

import { useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { OjoIcon, OjoTachadoIcon } from "@/lib/nav-icons";
import { mostrarTelefono } from "./telefono-actions";

/**
 * El WhatsApp de un dropshipper nunca sale escrito en la pantalla y tampoco dice que está oculto: a quien no es administrador no se le dibuja nada. A un
 * administrador (por ahora el único que puede) se le dibuja solo un ícono de ojo; al pulsarlo el servidor entrega el número y deja en la auditoría quién lo
 * vio, y el mismo ícono (tachado) lo vuelve a tapar.
 */
export function MostrarTelefono({ tipo, id, puede, className = "" }: { tipo: "conversacion" | "dropshipper"; id: string; puede: boolean; className?: string }) {
  const [numero, setNumero] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, empezar] = useTransition();
  if (!puede) return null;

  const etiqueta = numero ? "Ocultar número" : "Mostrar número";
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {numero && <span className="tabular-nums select-all">{numero}</span>}
      <Tooltip texto={etiqueta}>
        <button
          type="button"
          aria-label={etiqueta}
          aria-pressed={!!numero}
          disabled={cargando}
          onClick={() => {
            if (numero) return setNumero(null);
            setError(null);
            empezar(async () => {
              const r = await mostrarTelefono(tipo, id).catch(() => ({ error: "No se pudo mostrar." }));
              if ("error" in r) setError(r.error);
              else setNumero(r.telefono);
            });
          }}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--wa-sec,var(--muted-foreground))] hover:bg-[var(--wa-hover,var(--muted))] disabled:opacity-50 ${anilloFoco}`}
        >
          {numero ? <OjoTachadoIcon aria-hidden="true" className="h-4 w-4" /> : <OjoIcon aria-hidden="true" className="h-4 w-4" />}
        </button>
      </Tooltip>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
