"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { CerrarIcon } from "@/lib/nav-icons";

/**
 * Formularios que se abren **en el mismo lugar** en vez de en una ventana encima (30 oct 2026, pedido de Jhokser: con la ventana no se podía copiar ni
 * pegar nada del chat ni de la ficha). Una zona (`EnSitio`) junta los botones y un `DestinoEnSitio` debajo de ellos; el formulario del botón que se pulsa se
 * dibuja ahí (`PanelEnSitio`, con `createPortal`, así conserva su estado y sus avisos) y los demás botones, el chat y la ficha siguen a la vista y
 * seleccionables. Solo hay uno abierto a la vez. Fuera de una zona, quien lo pide cae en su ventana de siempre.
 */
interface Valor {
  destino: HTMLElement | null;
  activo: string | null;
  abrir: (id: string) => void;
  cerrar: (id: string) => void;
}

const Contexto = createContext<Valor | null>(null);
const FijarDestino = createContext<(el: HTMLElement | null) => void>(() => {});

export function EnSitio({ children }: { children: ReactNode }) {
  const [destino, setDestino] = useState<HTMLElement | null>(null);
  const [activo, setActivo] = useState<string | null>(null);
  const valor = useMemo<Valor>(
    () => ({ destino, activo, abrir: (id) => setActivo(id), cerrar: (id) => setActivo((a) => (a === id ? null : a)) }),
    [destino, activo],
  );
  return (
    <FijarDestino.Provider value={setDestino}>
      <Contexto.Provider value={valor}>{children}</Contexto.Provider>
    </FijarDestino.Provider>
  );
}

/** El sitio, debajo de los botones, donde se dibuja el formulario abierto (sin altura mientras no hay ninguno). */
export function DestinoEnSitio() {
  const fijar = useContext(FijarDestino);
  return <div ref={fijar} className="empty:hidden" />;
}

/** La zona en la que está esto, o `null` si no hay (el formulario se abre en su ventana). */
export const useEnSitio = () => useContext(Contexto);

/**
 * El marco del formulario abierto en el sitio: título, «Cerrar» y su contenido. Al abrirse lleva el foco al primer campo (`data-enfocar`) y se deja ver;
 * Escape lo cierra sin cerrar la ventana que lo contiene.
 */
export function PanelEnSitio({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: quieto ? "auto" : "smooth" });
    el.querySelector<HTMLElement>("[data-enfocar]")?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      ref={ref}
      aria-label={titulo}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        alCerrar();
      }}
      className="mt-1.5 overflow-hidden rounded-lg border border-border-control bg-card text-foreground"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2">
        <h4 className="m-0 min-w-0 truncate text-sm font-semibold">{titulo}</h4>
        <button type="button" onClick={alCerrar} aria-label={`Cerrar: ${titulo}`} className={`flex h-7 w-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}>
          <CerrarIcon className="h-4 w-4" />
        </button>
      </div>
      {children}
    </section>
  );
}
