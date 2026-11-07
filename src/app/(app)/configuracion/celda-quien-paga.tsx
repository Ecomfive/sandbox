"use client";

import { useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { QuienPagaFulfillment } from "@/lib/publicaciones/fulfillment-pais";
import { guardarQuienPagaFulfillment } from "./fulfillment-actions";

const OPCIONES: { valor: QuienPagaFulfillment; texto: string }[] = [
  { valor: "nosotros", texto: "Nosotros" },
  { valor: "dropshipper", texto: "Dropshipper" },
];

/**
 * Quién paga el fulfillment de una plataforma (Configuración, 7 nov 2026, pedido de Hernán): «Nosotros» o «Dropshipper». Si lo paga el dropshipper no se toma en cuenta en el margen. Se guarda
 * al elegir. Sin permiso de escritura, o en Dropi (su fulfillment va en cada publicación y siempre lo pagamos nosotros), solo se lee.
 */
export function CeldaQuienPaga({ id, plataforma, paga, puedeElegir }: { id: string; plataforma: string; paga: QuienPagaFulfillment; puedeElegir: boolean }) {
  const { mostrarToast } = useToast();
  const [actual, setActual] = useState(paga);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  if (!puedeElegir) return <span className="text-sm">{OPCIONES.find((o) => o.valor === actual)?.texto}</span>;

  function elegir(nuevo: QuienPagaFulfillment) {
    if (nuevo === actual) return;
    const antes = actual;
    setActual(nuevo);
    setError(null);
    empezar(async () => {
      const r = await guardarQuienPagaFulfillment(id, nuevo).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if ("error" in r) {
        setActual(antes);
        return void setError(r.error);
      }
      mostrarToast(nuevo === "dropshipper" ? `${plataforma}: el fulfillment lo paga el dropshipper y ya no cuenta en el margen.` : `${plataforma}: el fulfillment lo pagamos nosotros y cuenta en el margen.`);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div role="group" aria-label={`Quién paga el fulfillment de ${plataforma}`} className={`inline-flex w-fit items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 ${pendiente ? "opacity-60" : ""}`}>
        {OPCIONES.map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={actual === o.valor}
            disabled={pendiente}
            onClick={() => elegir(o.valor)}
            className={`min-h-8 rounded-md px-2.5 text-xs font-semibold ${actual === o.valor ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"} ${anilloFoco}`}
          >
            {o.texto}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="m-0 max-w-56 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
