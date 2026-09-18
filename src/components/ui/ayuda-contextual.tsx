"use client";

import { useEffect, useRef, useState } from "react";

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
        className="ml-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/50 text-[9px] leading-none font-medium text-muted-foreground hover:border-foreground hover:text-foreground"
      >
        ?
      </button>
      {abierto && (
        <span className="absolute bottom-full right-0 z-30 mb-1.5 w-56 rounded-md border border-border bg-card p-2 text-left text-xs font-normal text-muted-foreground shadow-lg">
          {texto}
        </span>
      )}
    </span>
  );
}
