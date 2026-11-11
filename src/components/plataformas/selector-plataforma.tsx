"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { setPlataformaActual } from "@/lib/plataforma-actions";
import { DropIcon, DropiIcon, DunamixfyIcon, EffiIcon } from "@/lib/nav-icons";
import type { Plataforma, PlataformaId } from "@/lib/plataformas";

export const LOGO_PLATAFORMA: Record<PlataformaId, typeof DropiIcon> = { dropi: DropiIcon, drop: DropIcon, effi: EffiIcon, dunamixfy: DunamixfyIcon };

/**
 * Elige la plataforma (Dropi o Drop; 3 nov 2026, pedido de Hernán). Es la misma que se elige arriba a la derecha, junto al país: cambiar una cambia la otra (comparten la cookie
 * `plataforma_actual`). `plataformas` son las que existen en el país elegido: Drop y Effi son solo de Costa Rica, así que con otro país la página no dibuja este selector (con una sola
 * plataforma no hay nada que elegir). Con `destinos` (Gestión de IDs, 6 nov 2026) cada plataforma es otra página: además de elegirla se va a la suya.
 */
export function SelectorPlataforma({ plataforma, plataformas, destinos }: { plataforma: PlataformaId; plataformas: readonly Plataforma[]; destinos?: Partial<Record<PlataformaId, string>> }) {
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
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
            onClick={() =>
              !activa &&
              empezar(async () => {
                await setPlataformaActual(p.id);
                const destino = destinos?.[p.id];
                if (destino) router.push(destino);
              })
            }
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
