"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";

/** Ícono "?" que muestra una breve explicación al hacer clic — para métricas que no son obvias. */
export function AyudaContextual({ texto }: { texto: string }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  return (
    <span ref={contenedorRef} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAbierto((v) => !v);
        }}
        aria-label="Ayuda"
        aria-expanded={abierto}
        // El círculo se ve de 14 px, pero el botón mide 24 (WCAG 2.5.8); los márgenes negativos evitan que la fila crezca.
        className={`group -my-1 ml-0 inline-flex h-6 w-6 shrink-0 items-center justify-center ${anilloFoco}`}
      >
        <span
          aria-hidden="true"
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-muted-foreground/50 text-[9px] leading-none font-medium text-muted-foreground group-hover:border-foreground group-hover:text-foreground"
        >
          ?
        </span>
      </button>
      {abierto && (
        <span className="absolute bottom-full right-0 z-30 mb-1.5 w-56 rounded-md border border-border bg-card p-2 text-left text-xs font-normal text-muted-foreground shadow-lg">
          {texto}
        </span>
      )}
    </span>
  );
}
