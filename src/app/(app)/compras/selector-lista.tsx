"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { anilloFoco } from "@/components/ui/field";
import { claseCampoPanel, claseOpcionPanel, PanelCelda, type MotivoCierre } from "./panel-celda";

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Un nombre nuevo, limpio: sin comas (separan la lista al guardar), sin espacios de más y con un largo razonable. */
export const limpiarNombre = (texto: string) => texto.replace(/,/g, " ").trim().replace(/\s+/g, " ").slice(0, 60);

/**
 * El panel de una lista de nombres, como el de etiquetas de ClickUp: se busca, se pulsa uno para ponerlo o quitarlo, y si lo
 * escrito no existe aparece «Crear …» (también con Enter) y queda puesto ahí mismo. Lo usan la columna Tienda (celda y
 * ficha) y la barra de varias compras. No guarda nada por sí mismo: avisa qué se pulsó y quien lo usa decide.
 */
export function PanelLista({
  ancla,
  etiqueta,
  ancho = 280,
  opciones,
  marca,
  renderOpcion,
  placeholder,
  alAlternar,
  alCrear,
  alCerrar,
}: {
  ancla: RefObject<HTMLElement | null>;
  etiqueta: string;
  ancho?: number;
  /** Todos los nombres que existen. */
  opciones: string[];
  /** Si el nombre está puesto del todo, solo en algunas (varias compras marcadas) o en ninguna. */
  marca: (nombre: string) => "si" | "algunas" | "no";
  /** Cómo se dibuja un nombre (por defecto, el texto). */
  renderOpcion?: (nombre: string) => ReactNode;
  placeholder: string;
  alAlternar: (nombre: string) => void;
  alCrear: (nombre: string) => void;
  alCerrar: (motivo: MotivoCierre) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    campo.current?.focus();
  }, []);

  const q = normal(busqueda);
  const lista = [...new Set(opciones)].sort((a, b) => a.localeCompare(b, "es"));
  const visibles = q ? lista.filter((o) => normal(o).includes(q)) : lista;
  const nueva = limpiarNombre(busqueda);
  const puedeCrear = !!nueva && !lista.some((o) => normal(o) === normal(nueva));
  const dibujar = renderOpcion ?? ((n: string) => <span className="truncate">{n}</span>);

  function crear() {
    if (!puedeCrear) return;
    alCrear(nueva);
    setBusqueda("");
  }

  return (
    <PanelCelda ancla={ancla} etiqueta={etiqueta} ancho={ancho} alCerrar={alCerrar}>
      <input
        ref={campo}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (puedeCrear) crear();
          else if (visibles.length === 1) alAlternar(visibles[0]);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={claseCampoPanel}
      />
      <ul className="m-0 flex max-h-64 list-none flex-col gap-0.5 overflow-y-auto p-1.5">
        {puedeCrear && (
          <li>
            <button type="button" onClick={crear} className={`${claseOpcionPanel} justify-start hover:bg-muted ${anilloFoco}`}>
              <span className="text-muted-foreground">Crear</span> {dibujar(nueva)}
            </button>
          </li>
        )}
        {visibles.map((o) => {
          const estado = marca(o);
          return (
            <li key={o}>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={estado === "si" ? true : estado === "algunas" ? "mixed" : false}
                onClick={() => alAlternar(o)}
                className={`${claseOpcionPanel} hover:bg-muted ${anilloFoco}`}
              >
                {dibujar(o)}
                {estado !== "no" && (
                  <span aria-hidden="true" className="text-xs text-primario">
                    {estado === "si" ? "✓" : "–"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {visibles.length === 0 && !puedeCrear && <li className="px-2 py-1.5 text-xs text-muted-foreground">Sin resultados.</li>}
      </ul>
    </PanelCelda>
  );
}
