"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { anilloFoco } from "@/components/ui/field";
import { CerrarIcon } from "@/lib/nav-icons";

const ENFOCABLES =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Ventana modal: al centro (ayuda, avisos) o como panel pegado a la derecha (vista rápida de un registro). Hace lo
 * que toda ventana debe: `role="dialog"` con nombre, el foco entra en ella y Tab queda atrapado dentro, Escape y
 * un clic fuera la cierran, y al cerrarse el foco vuelve a lo que la abrió. Se dibuja en `<body>`, así que no le
 * afectan los recortes ni las capas de la página. (Las ventanas de Retiros tienen su propia copia de esto.)
 */
export function Ventana({
  abierto,
  alCerrar,
  titulo,
  lado = "centro",
  ancho = "md",
  navegacion,
  children,
}: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: ReactNode;
  lado?: "centro" | "derecha";
  ancho?: "sm" | "md" | "lg";
  /** Botones de la cabecera junto a «Cerrar» (p. ej. pasar al registro anterior o siguiente). */
  navegacion?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cabeceraRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  // Siempre la última función, sin volver a montar los oyentes en cada render.
  const cerrarRef = useRef(alCerrar);
  useEffect(() => {
    cerrarRef.current = alCerrar;
  });

  // Con la ventana abierta, la página de atrás no se puede desplazar: sin esto quedaban dos barras de scroll
  // (la de la ventana y la de la página), y desplazar una a veces movía la otra por debajo.
  useEffect(() => {
    if (!abierto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const anterior = document.activeElement as HTMLElement | null;
    // El foco entra en el campo marcado con `data-enfocar` (el primero que hay que llenar) o, si no hay, en el primer
    // elemento enfocable.
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>("[data-enfocar]") ?? panel?.querySelector<HTMLElement>(ENFOCABLES))?.focus();

    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cerrarRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const enfocables = panelRef.current.querySelectorAll<HTMLElement>(ENFOCABLES);
      if (enfocables.length === 0) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener("keydown", alPresionarTecla);
    return () => {
      document.removeEventListener("keydown", alPresionarTecla);
      // Si lo que abrió la ventana ya no está (la fila cambió), el foco se queda donde esté.
      if (anterior && document.contains(anterior)) anterior.focus();
    };
  }, [abierto]);

  // La cabecera queda fija arriba; su alto (que cambia si el título ocupa dos líneas) se publica como
  // `--alto-cabecera` para que algo dentro del panel pueda pegarse justo debajo al desplazarse.
  useEffect(() => {
    if (!abierto) return;
    const panel = panelRef.current;
    const cabecera = cabeceraRef.current;
    if (!panel || !cabecera) return;
    const medir = () => panel.style.setProperty("--alto-cabecera", `${cabecera.offsetHeight}px`);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(cabecera);
    return () => observador.disconnect();
  }, [abierto]);

  if (!abierto) return null;

  const anchoClase = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[ancho];
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex bg-black/40 ${lado === "derecha" ? "justify-end" : "items-center justify-center p-4"}`}
      onClick={alCerrar}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onClick={(e) => e.stopPropagation()}
        className={
          lado === "derecha"
            ? `animate-entrar-derecha flex h-full w-full ${anchoClase} flex-col overflow-y-auto border-l border-border bg-card shadow-xl`
            : `max-h-[90vh] w-full ${anchoClase} overflow-y-auto rounded-xl border border-border bg-card shadow-xl`
        }
      >
        <div
          ref={cabeceraRef}
          className={`sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card ${
            lado === "derecha" ? "px-5 py-3" : "px-4 py-2.5"
          }`}
        >
          <h2 id={tituloId} className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
            {titulo}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {navegacion}
            <button
              type="button"
              onClick={alCerrar}
              aria-label="Cerrar"
              className={
                lado === "derecha"
                  ? `flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground hover:bg-muted ${anilloFoco} !rounded-md`
                  : `p-1.5 text-muted-foreground hover:text-foreground ${anilloFoco}`
              }
            >
              <CerrarIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
