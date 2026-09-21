"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { anilloFoco } from "@/components/ui/field";

/** Ancho del globo de ayuda (w-56 = 14rem) y separación con el «?». */
const ANCHO = 224;
const SEPARACION = 6;
const MARGEN = 8;

/**
 * Ícono "?" que muestra una breve explicación al hacer clic — para métricas que no son obvias. El globo se dibuja en
 * `<body>` con posición fija, no dentro de la tarjeta: las tarjetas recortan lo que se sale (`overflow-hidden`), y
 * dentro de ellas el texto quedaba cortado y tapado por la tarjeta de al lado. Sale arriba del «?» y, si arriba no
 * cabe, abajo; nunca se sale de la pantalla. Se cierra con Escape, al pulsar fuera y al desplazar o cambiar el tamaño.
 */
export function AyudaContextual({ texto }: { texto: string }) {
  const [posicion, setPosicion] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const globoRef = useRef<HTMLSpanElement>(null);
  const idGlobo = useId();
  const abierto = posicion !== null;

  function alternar() {
    if (abierto) {
      setPosicion(null);
      return;
    }
    const r = botonRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(r.right - ANCHO, MARGEN), window.innerWidth - ANCHO - MARGEN);
    // Arriba si hay sitio para un globo de ~7 rem; si no, abajo.
    setPosicion(
      r.top > 120
        ? { left, bottom: window.innerHeight - r.top + SEPARACION }
        : { left, top: r.bottom + SEPARACION }
    );
  }

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setPosicion(null);
    function alHacerClicFuera(e: MouseEvent) {
      const destino = e.target as Node;
      if (botonRef.current?.contains(destino) || globoRef.current?.contains(destino)) return;
      cerrar();
    }
    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        cerrar();
        botonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    document.addEventListener("keydown", alPresionarTecla);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", alHacerClicFuera);
      document.removeEventListener("keydown", alPresionarTecla);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={botonRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          alternar();
        }}
        aria-label="Ayuda"
        aria-expanded={abierto}
        aria-controls={abierto ? idGlobo : undefined}
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
      {posicion &&
        createPortal(
          <span
            ref={globoRef}
            id={idGlobo}
            role="note"
            style={{ left: posicion.left, top: posicion.top, bottom: posicion.bottom, width: ANCHO }}
            className="fixed z-40 rounded-md border border-border bg-card p-2 text-left text-xs font-normal text-muted-foreground shadow-lg"
          >
            {texto}
          </span>,
          document.body
        )}
    </span>
  );
}
