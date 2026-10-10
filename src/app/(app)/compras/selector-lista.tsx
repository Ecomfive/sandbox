"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { anilloFoco } from "@/components/ui/field";
import { LapizIcon } from "@/lib/nav-icons";
import { COLORES_ETIQUETA } from "./selector-etiquetas";
import type { GestionTiendas } from "./tiendas";
import { claseCampoPanel, claseOpcionPanel, PanelCelda, type MotivoCierre } from "./panel-celda";

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Un nombre nuevo, limpio: sin comas (separan la lista al guardar), sin espacios de más y con un largo razonable. */
export const limpiarNombre = (texto: string) => texto.replace(/,/g, " ").trim().replace(/\s+/g, " ").slice(0, 60);

/**
 * El panel de una lista de nombres, como el de etiquetas de ClickUp: se busca, se pulsa uno para ponerlo o quitarlo, y si lo
 * escrito no existe aparece «Crear …» (también con Enter) y queda puesto ahí mismo. Lo usan la columna Tienda (celda y
 * ficha) y la barra de varias compras. No guarda nada por sí mismo: avisa qué se pulsó y quien lo usa decide.
 *
 * Con `gestion` (las tiendas), cada nombre lleva un lápiz que despliega su color (como las etiquetas) y su nombre, que al
 * cambiarlo se cambia en todas las compras; `alRenombrado` avisa a quien tenga el nombre viejo puesto sin guardar.
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
  gestion,
  alRenombrado,
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
  gestion?: GestionTiendas | null;
  alRenombrado?: (antes: string, despues: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  // El nombre cuyo color y nombre se están editando, y lo escrito como nombre nuevo.
  const [editando, setEditando] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [renombrando, setRenombrando] = useState(false);
  async function renombrar(antes: string) {
    const despues = limpiarNombre(nombreNuevo);
    if (!gestion || !despues || despues === antes || renombrando) return;
    setRenombrando(true);
    const ok = await gestion.renombrar(antes, despues);
    setRenombrando(false);
    if (!ok) return;
    alRenombrado?.(antes, despues);
    setEditando(null);
  }
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
            <li key={o} className="flex flex-col">
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={estado === "si" ? true : estado === "algunas" ? "mixed" : false}
                  onClick={() => alAlternar(o)}
                  className={`${claseOpcionPanel} min-w-0 flex-1 hover:bg-muted ${anilloFoco}`}
                >
                  {dibujar(o)}
                  {estado !== "no" && (
                    <span aria-hidden="true" className="text-xs text-primario">
                      {estado === "si" ? "✓" : "–"}
                    </span>
                  )}
                </button>
                {gestion && (
                  <button
                    type="button"
                    aria-label={`Color y nombre de ${o}`}
                    title="Color y nombre"
                    aria-expanded={editando === o}
                    onClick={() => {
                      setEditando((e) => (e === o ? null : o));
                      setNombreNuevo(o);
                    }}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
                  >
                    <LapizIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
              {gestion && editando === o && (
                <span className="flex flex-col gap-2 px-2 pt-1 pb-2">
                  <span className="flex items-center gap-1.5">
                    <input
                      value={nombreNuevo}
                      onChange={(e) => setNombreNuevo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        e.stopPropagation();
                        void renombrar(o);
                      }}
                      aria-label={`Nuevo nombre de ${o}`}
                      className="min-w-0 flex-1 rounded-md border border-border-control bg-card px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      disabled={renombrando || !limpiarNombre(nombreNuevo) || limpiarNombre(nombreNuevo) === o}
                      onClick={() => void renombrar(o)}
                      className={`rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background disabled:opacity-40 ${anilloFoco}`}
                    >
                      {renombrando ? "…" : "Renombrar"}
                    </button>
                  </span>
                  <span role="group" aria-label={`Colores para ${o}`} className="flex flex-wrap gap-1.5">
                    {COLORES_ETIQUETA.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Color ${color}`}
                        aria-pressed={gestion.colorDe(o) === color}
                        onClick={() => gestion.cambiarColor(o, color)}
                        style={{ backgroundColor: color }}
                        className={`h-5 w-5 rounded-full ${gestion.colorDe(o) === color ? "ring-2 ring-foreground ring-offset-1 ring-offset-card" : ""} ${anilloFoco}`}
                      />
                    ))}
                  </span>
                </span>
              )}
            </li>
          );
        })}
        {visibles.length === 0 && !puedeCrear && <li className="px-2 py-1.5 text-xs text-muted-foreground">Sin resultados.</li>}
      </ul>
    </PanelCelda>
  );
}
