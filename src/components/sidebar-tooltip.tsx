"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** El tooltip se saca por portal a <body> — si viviera dentro del <nav> colapsable, un
 * span posicionado a la derecha (aunque invisible) infla su ancho "scrolleable" y aparece
 * un scroll horizontal fantasma en el riel de 64px. Fuera del árbol de nav, no pasa. */
export function ConTooltip({
  etiqueta,
  mostrar,
  children,
}: {
  etiqueta: string;
  mostrar: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function alEntrar() {
    if (!mostrar || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
  }

  return (
    <div ref={ref} className="flex" onMouseEnter={alEntrar} onMouseLeave={() => setPos(null)}>
      {children}
      {mostrar &&
        pos &&
        createPortal(
          <span
            style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateY(-50%)" }}
            className="animate-fade-in pointer-events-none z-50 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background shadow-md"
          >
            {etiqueta}
          </span>,
          document.body
        )}
    </div>
  );
}
