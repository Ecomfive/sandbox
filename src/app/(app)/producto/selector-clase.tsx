"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { CheckIcon, ChevronRightIcon } from "@/lib/nav-icons";
import { PanelCelda } from "../compras/panel-celda";
import { ETIQUETA_CLASE, TONO_CLASE } from "./def-producto";

const CLASES = ["fisico", "test", "inactivo", "descontinuado"] as const;

/**
 * El Estado del producto en su ficha: su insignia de color y, al pulsarla, la lista de estados cada uno con su color (como las
 * etiquetas), en el panel flotante de las celdas de Compras: flechas, Enter y Escape. Un `<select>` no deja pintar sus opciones.
 */
export function SelectorClaseProducto({ clase, deshabilitado, alCambiar }: { clase: string; deshabilitado: boolean; alCambiar: (nueva: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`Estado del producto: ${ETIQUETA_CLASE[clase] ?? clase}. Cambiar estado`}
        disabled={deshabilitado}
        onClick={() => setAbierto((a) => !a)}
        className={`inline-flex items-center gap-1.5 rounded-md border border-border-control px-1.5 py-1 hover:bg-muted disabled:opacity-60 ${anilloFoco}`}
      >
        <Badge tone={TONO_CLASE[clase]}>{ETIQUETA_CLASE[clase] ?? clase}</Badge>
        <ChevronRightIcon aria-hidden="true" className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
      </button>
      {abierto && (
        <ListaClases
          ancla={boton}
          actual={clase}
          alElegir={(nueva) => {
            setAbierto(false);
            boton.current?.focus();
            if (nueva !== clase) alCambiar(nueva);
          }}
          alCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}

function ListaClases({ ancla, actual, alElegir, alCerrar }: { ancla: React.RefObject<HTMLButtonElement | null>; actual: string; alElegir: (c: string) => void; alCerrar: () => void }) {
  const [activa, setActiva] = useState(() => Math.max(0, CLASES.indexOf(actual as (typeof CLASES)[number])));
  const lista = useRef<HTMLUListElement>(null);
  useEffect(() => lista.current?.focus(), []);

  function teclas(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((i) => (i + (e.key === "ArrowDown" ? 1 : CLASES.length - 1)) % CLASES.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      alElegir(CLASES[activa]);
    }
  }

  return (
    <PanelCelda ancla={ancla} etiqueta="Estado del producto" alCerrar={alCerrar} ancho={220}>
      <ul ref={lista} role="listbox" aria-label="Estado del producto" aria-activedescendant={`clase-producto-${activa}`} tabIndex={0} onKeyDown={teclas} className="m-0 flex list-none flex-col gap-0.5 p-1.5 outline-none">
        {CLASES.map((c, i) => (
          <li
            key={c}
            id={`clase-producto-${i}`}
            role="option"
            aria-selected={c === actual}
            onMouseEnter={() => setActiva(i)}
            onClick={() => alElegir(c)}
            className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${i === activa ? "bg-primario-suave" : ""}`}
          >
            <Badge tone={TONO_CLASE[c]}>{ETIQUETA_CLASE[c]}</Badge>
            {c === actual && <CheckIcon className="h-4 w-4 text-primario" />}
          </li>
        ))}
      </ul>
    </PanelCelda>
  );
}
