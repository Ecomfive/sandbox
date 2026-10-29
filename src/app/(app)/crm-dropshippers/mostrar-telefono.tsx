"use client";

import { useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { mostrarTelefono } from "./telefono-actions";

/**
 * El WhatsApp de un dropshipper nunca sale escrito en la pantalla: se ve «Número oculto» y, a quien puede (por ahora, los administradores), el botón
 * «Mostrar número», que lo pide al servidor y deja quién lo vio en la auditoría. «Ocultar» lo vuelve a tapar.
 */
export function MostrarTelefono({ tipo, id, puede, className = "" }: { tipo: "conversacion" | "dropshipper"; id: string; puede: boolean; className?: string }) {
  const [numero, setNumero] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, empezar] = useTransition();
  if (!puede) return <span className={className}>Número oculto</span>;
  if (numero)
    return (
      <span className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
        <span className="tabular-nums select-all">{numero}</span>
        <button type="button" onClick={() => setNumero(null)} className={`text-xs font-medium underline-offset-2 hover:underline ${anilloFoco}`}>
          Ocultar
        </button>
      </span>
    );
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <span>Número oculto</span>
      <button
        type="button"
        disabled={cargando}
        onClick={() => {
          setError(null);
          empezar(async () => {
            const r = await mostrarTelefono(tipo, id).catch(() => ({ error: "No se pudo mostrar." }));
            if ("error" in r) setError(r.error);
            else setNumero(r.telefono);
          });
        }}
        className={`text-xs font-medium underline-offset-2 hover:underline disabled:opacity-50 ${anilloFoco}`}
      >
        {cargando ? "Mostrando…" : "Mostrar número"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
