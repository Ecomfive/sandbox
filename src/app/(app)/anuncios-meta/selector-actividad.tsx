"use client";

import { anilloFoco } from "@/components/ui/field";
import type { VistaActividad } from "@/lib/meta-ads/en-marcha";

const OPCIONES: { id: VistaActividad; texto: string }[] = [
  { id: "activos", texto: "Con campañas activas" },
  { id: "apagados", texto: "Apagados" },
  { id: "todos", texto: "Todos" },
];

/** Qué se ve en Anuncios Meta: lo que sigue anunciándose, lo apagado (para consultar cómo le fue) o todo. `cuentas` pone cuántos hay en cada uno. */
export function SelectorActividad({ vista, alCambiar, etiqueta, cuentas, textos }: { vista: VistaActividad; alCambiar: (v: VistaActividad) => void; etiqueta: string; cuentas?: Record<VistaActividad, number>; textos?: Record<VistaActividad, string> }) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
      {OPCIONES.map((o) => {
        const activa = o.id === vista;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={activa}
            onClick={() => alCambiar(o.id)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold ${activa ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"} ${anilloFoco}`}
          >
            {textos?.[o.id] ?? o.texto}
            {cuentas && <span className={`text-xs font-medium tabular-nums ${activa ? "opacity-80" : "text-muted-foreground"}`}>{cuentas[o.id].toLocaleString("es-PA")}</span>}
          </button>
        );
      })}
    </div>
  );
}
