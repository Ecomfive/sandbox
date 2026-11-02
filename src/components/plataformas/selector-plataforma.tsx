"use client";

import { useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { setPlataformaActual } from "@/lib/plataforma-actions";
import { DropIcon, DropiIcon } from "@/lib/nav-icons";
import type { Plataforma, PlataformaId } from "@/lib/plataformas";

export const LOGO_PLATAFORMA: Record<PlataformaId, typeof DropiIcon> = { dropi: DropiIcon, drop: DropIcon };

/**
 * Elige la plataforma (Dropi o Drop; 3 nov 2026, pedido de Hernán). Es la misma que se elige arriba a la derecha, junto al país: cambiar una cambia la otra (comparten la cookie
 * `plataforma_actual`). `plataformas` son las que existen en el país elegido: Drop es solo de Costa Rica, así que con otro país la página no dibuja este selector (con una sola
 * plataforma no hay nada que elegir).
 */
export function SelectorPlataforma({ plataforma, plataformas }: { plataforma: PlataformaId; plataformas: readonly Plataforma[] }) {
  const [pendiente, empezar] = useTransition();
  return (
    <div role="group" aria-label="Plataforma" className={`inline-flex w-fit items-center gap-1 rounded-xl border border-border bg-card p-1 ${pendiente ? "opacity-60" : ""}`}>
      {plataformas.map((p) => {
        const Logo = LOGO_PLATAFORMA[p.id];
        const activa = p.id === plataforma;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={activa}
            disabled={pendiente}
            onClick={() => !activa && empezar(() => setPlataformaActual(p.id))}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold ${activa ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"} ${anilloFoco}`}
          >
            <Logo marca className="h-5 w-5" />
            {p.nombre}
          </button>
        );
      })}
    </div>
  );
}
