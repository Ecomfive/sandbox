"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";

/**
 * Botón con un menú desplegable (patrón «menu button»): se abre con clic o con flecha abajo, el foco pasa a la primera
 * opción, las flechas, Inicio y Fin se mueven por ellas, Escape cierra y devuelve el foco, y Tab o un clic fuera cierran.
 * Las opciones son los elementos con `role="menuitem"`, `"menuitemradio"` o `"menuitemcheckbox"` que pongas dentro.
 * `children` recibe `cerrar` para cerrar el menú al elegir algo.
 */
export function MenuDesplegable({
  etiqueta,
  claseBoton,
  contenidoBoton,
  alineacion = "derecha",
  claseMenu = "w-72",
  children,
}: {
  /** Nombre accesible del botón y del menú. */
  etiqueta: string;
  claseBoton: string;
  contenidoBoton: ReactNode;
  alineacion?: "derecha" | "izquierda";
  claseMenu?: string;
  children: (cerrar: (devolverFoco?: boolean) => void) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const idBoton = `${idMenu}-boton`;

  useEffect(() => {
    if (!abierto) return;
    function alHacerClicFuera(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, [abierto]);

  // Al abrir, el foco pasa a la primera opción (la elegida, si es un grupo de opciones únicas).
  useEffect(() => {
    if (!abierto) return;
    const menu = raiz.current;
    (menu?.querySelector<HTMLElement>('[aria-checked="true"]:not([disabled])') ?? menu?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])'))?.focus();
  }, [abierto]);

  function cerrar(devolverFoco = false) {
    setAbierto(false);
    // Por id y no por una ref: `children` recibe esta función al dibujar y las refs no se tocan al dibujar.
    if (devolverFoco) document.getElementById(idBoton)?.focus();
  }

  function alTeclearEnMenu(e: React.KeyboardEvent) {
    const opciones = [...(raiz.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
    const actual = opciones.indexOf(document.activeElement as HTMLElement);
    const ir = (i: number) => {
      e.preventDefault();
      opciones[(i + opciones.length) % opciones.length]?.focus();
    };
    if (e.key === "ArrowDown") ir(actual + 1);
    else if (e.key === "ArrowUp") ir(actual - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(opciones.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      cerrar(true);
    } else if (e.key === "Tab") cerrar(false);
  }

  return (
    <div ref={raiz} className="relative shrink-0">
      <button
        id={idBoton}
        type="button"
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !abierto) {
            e.preventDefault();
            setAbierto(true);
          }
        }}
        className={`${claseBoton} ${anilloFoco}`}
      >
        {contenidoBoton}
      </button>
      {abierto && (
        <div
          id={idMenu}
          role="menu"
          aria-label={etiqueta}
          onKeyDown={alTeclearEnMenu}
          className={`absolute top-full z-40 mt-1 rounded-xl border border-border bg-card p-1 shadow-lg ${alineacion === "derecha" ? "right-0" : "left-0"} ${claseMenu}`}
        >
          {children(cerrar)}
        </div>
      )}
    </div>
  );
}

/** Clase de una opción de un menú desplegable. */
export const claseOpcionMenu =
  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted focus:bg-muted focus:outline-none disabled:pointer-events-none disabled:text-muted-foreground";

/** Rótulo de un grupo de opciones dentro de un menú desplegable. */
export function TituloGrupoMenu({ children }: { children: ReactNode }) {
  return <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{children}</p>;
}
