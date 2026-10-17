"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { CheckIcon } from "@/lib/nav-icons";
import { PanelCelda } from "../compras/panel-celda";
import { ESTADOS_SELECCION } from "./def-seleccion";

/** Una opción de estado con su color (Selección por defecto; Sugerencias de clientes pasa los suyos). */
export type OpcionEstado = { readonly valor: string; readonly etiqueta: string; readonly color: string };

/** La lista de estados en el panel flotante de las celdas (el de Compras): flechas, Enter y Escape, como en ClickUp. */
function PanelEstados({
  ancla,
  actual,
  aria,
  opciones,
  alElegir,
  alCerrar,
}: {
  opciones: readonly OpcionEstado[];
  ancla: React.RefObject<HTMLButtonElement | null>;
  actual: string | null;
  aria: string;
  alElegir: (estado: string) => void;
  alCerrar: () => void;
}) {
  const [activa, setActiva] = useState(() => Math.max(0, opciones.findIndex((e) => e.valor === actual)));
  const lista = useRef<HTMLUListElement>(null);
  useEffect(() => lista.current?.focus(), []);

  function teclas(e: KeyboardEvent) {
    const n = opciones.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      alElegir(opciones[activa].valor);
    }
  }

  return (
    <PanelCelda ancla={ancla} etiqueta={aria} alCerrar={alCerrar} ancho={220}>
      <ul ref={lista} role="listbox" aria-label={aria} aria-activedescendant={`estado-sel-${activa}`} tabIndex={0} onKeyDown={teclas} className="m-0 flex list-none flex-col gap-0.5 p-1.5 outline-none">
        {opciones.map((e, i) => (
          <li
            key={e.valor}
            id={`estado-sel-${i}`}
            role="option"
            aria-selected={e.valor === actual}
            onMouseEnter={() => setActiva(i)}
            onClick={() => alElegir(e.valor)}
            className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${i === activa ? "bg-primario-suave" : ""}`}
          >
            <Badge color={e.color}>{e.etiqueta}</Badge>
            {e.valor === actual && <CheckIcon className="h-4 w-4 text-primario" />}
          </li>
        ))}
      </ul>
    </PanelCelda>
  );
}

/**
 * El estado de una fila como botón: al pulsarlo se elige otro de la lista. Sin permiso de escritura es solo la insignia.
 * `children` cambia lo que se ve en el botón (la barra de varias filas pone «Estado»).
 */
export function SelectorEstado({
  estado,
  aria,
  puedeEscribir,
  alCambiar,
  opciones = ESTADOS_SELECCION,
  children,
}: {
  estado: string | null;
  /** Los estados que se ofrecen, con su color (por defecto, los de Selección de productos). */
  opciones?: readonly OpcionEstado[];
  aria: string;
  puedeEscribir: boolean;
  alCambiar: (estado: string) => void;
  children?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const opcion = opciones.find((o) => o.valor === estado);
  const insignia = estado ? <Badge color={opcion?.color ?? "#8D8D8D"}>{opcion?.etiqueta ?? estado}</Badge> : null;
  if (!puedeEscribir) return insignia;
  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={aria}
        onClick={() => setAbierto((a) => !a)}
        className={`rounded-md px-0.5 py-0.5 hover:bg-muted ${anilloFoco}`}
      >
        {children ?? insignia}
      </button>
      {abierto && (
        <PanelEstados
          ancla={boton}
          actual={estado}
          aria={aria}
          opciones={opciones}
          alElegir={(nuevo) => {
            setAbierto(false);
            if (nuevo !== estado) alCambiar(nuevo);
            boton.current?.focus();
          }}
          alCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}
