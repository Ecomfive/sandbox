"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

/** Un botón de la fila que pide confirmación en la misma fila (Eliminar, Desactivar). */
export function ConfirmarEnFila({
  etiqueta,
  ariaLabel,
  confirmar = `Sí, ${etiqueta.toLowerCase()}`,
  hecho,
  ejecutar,
}: {
  etiqueta: string;
  ariaLabel: string;
  confirmar?: string;
  hecho: string;
  ejecutar: () => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} aria-label={ariaLabel} className={`rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted ${anilloFoco}`}>
        {etiqueta}
      </button>
    );
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await ejecutar();
            if (r.error) mostrarToast(r.error, "destructive");
            else mostrarToast(hecho);
            setAbierto(false);
            router.refresh();
          })
        }
        className={`rounded-md border border-destructive/30 bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive disabled:opacity-40 ${anilloFoco}`}
      >
        {pendiente ? "…" : confirmar}
      </button>
      <button type="button" onClick={() => setAbierto(false)} className={`rounded-md border border-border px-2 py-0.5 text-xs ${anilloFoco}`}>
        No
      </button>
    </span>
  );
}
