"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { anilloFoco } from "@/components/ui/field";
import { SelectorModoFicha, useModoFicha } from "@/components/ui/selector-modo-ficha";
import { esFicha } from "@/lib/ficha/modo";
import { CerrarIcon } from "@/lib/nav-icons";

const ENFOCABLES =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Las ventanas abiertas, de la más vieja a la más nueva: con una ficha abierta encima de otra, Escape y Tab solo los atiende la de arriba.
const PILA: symbol[] = [];

/**
 * Ventana modal: al centro (ayuda, avisos) o como panel pegado a la derecha (vista rápida de un registro). **Una ficha** (el panel
 * a la derecha o la ventana grande al centro) se abre como la persona prefiera —barra lateral, cuadro de diálogo al centro o pantalla
 * completa, como una tarea de ClickUp—: el botón de su cabecera lo cambia y la elección vale para todas las fichas (`modo-ficha-v1`).
 * Hace lo que toda ventana debe: `role="dialog"` con nombre, el foco entra en ella y Tab queda atrapado dentro, Escape y
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
  /** `xl`: la ventana grande al centro, como la vista de una tarea de ClickUp (casi toda la pantalla, de alto fijo: el
   * contenido decide qué se desplaza, p. ej. dos columnas con su propio scroll). Es una ficha: su modo por defecto es el centro. */
  ancho?: "sm" | "md" | "lg" | "xl";
  /** Botones de la cabecera junto a «Cerrar» (p. ej. pasar al registro anterior o siguiente). */
  navegacion?: ReactNode;
  children: ReactNode;
}) {
  const ficha = esFicha(lado, ancho);
  const modoElegido = useModoFicha(lado);
  // Solo las fichas cambian de modo; un diálogo pequeño (ayuda, atajos) sigue siendo el de siempre.
  const modo = ficha ? modoElegido : null;
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

    const yo = Symbol("ventana");
    PILA.push(yo);

    function alPresionarTecla(e: KeyboardEvent) {
      if (PILA[PILA.length - 1] !== yo) return;
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
      PILA.splice(PILA.indexOf(yo), 1);
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

  const anchoClase = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-6xl" }[ancho];
  // Cómo se dibuja cada modo: la barra lateral (el panel de siempre; la ventana grande, más angosta), el cuadro al centro y la
  // pantalla completa. En los tres el panel se desplaza por dentro; lo que se desplace aparte (dos columnas) lo decide el contenido.
  const claseCapa =
    modo === "lateral" ? "justify-end" : modo === "completa" ? "" : "items-center justify-center p-4";
  const clasePanel =
    modo === "lateral"
      ? `animate-entrar-derecha flex h-full w-full ${ancho === "xl" ? "max-w-3xl" : anchoClase} flex-col overflow-y-auto border-l border-border bg-card shadow-xl`
      : modo === "centro"
        ? `animate-entrar-centro flex h-[92vh] w-full ${ancho === "xl" ? "max-w-6xl" : "max-w-4xl"} flex-col overflow-y-auto rounded-xl border border-border bg-card shadow-2xl`
        : modo === "completa"
          ? "animate-entrar-centro flex h-full w-full flex-col overflow-y-auto bg-card"
          : `max-h-[90vh] w-full ${anchoClase} overflow-y-auto rounded-xl border border-border bg-card shadow-xl`;
  return createPortal(
    <div className={`fixed inset-0 z-50 flex bg-black/40 ${claseCapa}`} onClick={alCerrar}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={tituloId} onClick={(e) => e.stopPropagation()} className={clasePanel}>
        <div ref={cabeceraRef} className={`sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card ${ficha ? "px-5 py-3" : "px-4 py-2.5"}`}>
          <h2 id={tituloId} className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
            {titulo}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {navegacion}
            {modo && <SelectorModoFicha modo={modo} />}
            <button
              type="button"
              onClick={alCerrar}
              aria-label="Cerrar"
              className={
                ficha
                  ? `flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground hover:bg-muted ${anilloFoco} !rounded-md`
                  : `p-1.5 text-muted-foreground hover:text-foreground ${anilloFoco}`
              }
            >
              <CerrarIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* A pantalla completa el contenido no se estira de lado a lado: se centra con un ancho cómodo de lectura. */}
        {modo === "completa" ? <div className={`mx-auto flex w-full flex-1 flex-col ${ancho === "xl" ? "max-w-[90rem]" : "max-w-5xl"}`}>{children}</div> : children}
      </div>
    </div>,
    document.body
  );
}
