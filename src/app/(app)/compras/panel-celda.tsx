"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/** Por qué se cerró el panel: con Escape se descarta lo escrito; al pulsar fuera (o desplazar la tabla) se guarda. */
export type MotivoCierre = "escape" | "fuera";

/**
 * El panel flotante de las celdas de Compras (el mismo para todas, como los de ClickUp): sale bajo la celda, va en `<body>`
 * para que la tabla no lo recorte, y se cierra al pulsar fuera, al desplazar la página o con Escape. Desplazar la lista de
 * dentro del panel no lo cierra.
 */
export function PanelCelda({
  ancla,
  ancho = 260,
  etiqueta,
  alCerrar,
  children,
}: {
  ancla: RefObject<HTMLElement | null>;
  ancho?: number;
  etiqueta: string;
  alCerrar: (motivo: MotivoCierre) => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const cerrar = useRef(alCerrar);
  useEffect(() => {
    cerrar.current = alCerrar;
  });

  useLayoutEffect(() => {
    const r = ancla.current?.getBoundingClientRect();
    if (!r) return;
    const alto = panel.current?.offsetHeight ?? 320;
    const abajo = r.bottom + 4;
    // Si no cabe debajo, sale encima de la celda.
    const top = abajo + alto > window.innerHeight - 8 && r.top - alto - 4 > 8 ? r.top - alto - 4 : Math.min(abajo, window.innerHeight - alto - 8);
    setPos({
      top: Math.max(8, top),
      left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
    });
  }, [ancla, ancho]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !ancla.current?.contains(t)) cerrar.current("fuera");
    };
    const desplazar = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) cerrar.current("fuera");
    };
    document.addEventListener("mousedown", fuera);
    window.addEventListener("scroll", desplazar, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("scroll", desplazar, true);
    };
  }, [ancla]);

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={etiqueta}
      onClick={(e) => e.stopPropagation()}
      // Lo que se escribe aquí (buscar una tienda) no es del formulario que lo rodea en el árbol de React (la ficha): sin esto
      // «Guardar cambios» se encendía con solo buscar.
      onChange={(e) => e.stopPropagation()}
      onInput={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cerrar.current("escape");
        }
      }}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: ancho }}
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card text-sm shadow-lg"
    >
      {children}
    </div>,
    document.body,
  );
}

/** El campo de arriba del panel (buscar, escribir el dato): sin caja propia, separado por una línea, como en ClickUp. */
export const claseCampoPanel = "w-full border-b border-border bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground";

/** Una opción de la lista del panel. */
export const claseOpcionPanel = "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm";
