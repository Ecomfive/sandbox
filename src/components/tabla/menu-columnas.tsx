"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { ArrastrarIcon, ColumnasIcon } from "@/lib/nav-icons";
import { DENSIDADES } from "@/lib/tabla/densidad";
import { useDensidad } from "./densidad";
import type { ColumnaDef, EstadoColumnas } from "./ganchos";

/**
 * Menú "Columnas": casilla para ocultar, arrastrar (o flechas) para reordenar, y la densidad de las filas
 * (cómoda o compacta, para todas las tablas). Cada persona guarda lo suyo.
 */
export function MenuColumnas({
  columnas,
  estado,
  alCambiar,
}: {
  columnas: ColumnaDef[];
  estado: EstadoColumnas;
  alCambiar: (cambio: { orden?: string[]; ocultas?: string[] }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [densidad, cambiarDensidad] = useDensidad();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const porId = new Map(columnas.map((c) => [c.id, c]));

  useEffect(() => {
    if (!abierto) return;
    function alPulsar(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setAbierto(false);
      if (contenedorRef.current?.contains(document.activeElement)) botonRef.current?.focus();
    }
    document.addEventListener("mousedown", alPulsar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alPulsar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  function mover(origenId: string, destinoId: string) {
    if (origenId === destinoId) return;
    const sinOrigen = estado.orden.filter((id) => id !== origenId);
    sinOrigen.splice(sinOrigen.indexOf(destinoId), 0, origenId);
    alCambiar({ orden: sinOrigen });
  }

  // Alternativa de teclado al arrastrar con ratón: mueve una posición arriba/abajo.
  function moverPorTeclado(id: string, direccion: -1 | 1) {
    const indice = estado.orden.indexOf(id);
    const destino = indice + direccion;
    if (destino < 0 || destino >= estado.orden.length) return;
    const copia = [...estado.orden];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    alCambiar({ orden: copia });
  }

  function alternarVisible(id: string) {
    const siguiente = new Set(estado.ocultas);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    alCambiar({ ocultas: [...siguiente] });
  }

  return (
    <div ref={contenedorRef} className="relative">
      <Tooltip texto="Columnas y densidad">
        <button
          ref={botonRef}
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-label="Columnas y densidad"
          className={`flex min-h-8 items-center gap-1.5 !rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted ${anilloFoco}`}
        >
          <ColumnasIcon className="h-4 w-4" />
          <span className="sr-only">Columnas</span>
        </button>
      </Tooltip>
      {abierto && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-border bg-card p-1 shadow-lg">
          {estado.orden.map((id, indice) => {
            const columna = porId.get(id);
            if (!columna) return null;
            return (
              <div
                key={id}
                draggable
                onDragStart={() => setArrastrando(id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (arrastrando) mover(arrastrando, id);
                  setArrastrando(null);
                }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <ArrastrarIcon className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                <label className="flex flex-1 items-center gap-2 select-none">
                  <input
                    type="checkbox"
                    checked={!estado.ocultas.has(id)}
                    disabled={!columna.ocultable}
                    onChange={() => alternarVisible(id)}
                    className="h-4 w-4"
                  />
                  {columna.label}
                </label>
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => moverPorTeclado(id, -1)}
                    disabled={indice === 0}
                    aria-label={`Mover columna ${columna.label} hacia arriba`}
                    className={`flex h-6 w-6 items-center justify-center text-xs leading-none text-muted-foreground hover:bg-border disabled:opacity-30 ${anilloFoco}`}
                  >
                    <span aria-hidden="true">▲</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => moverPorTeclado(id, 1)}
                    disabled={indice === estado.orden.length - 1}
                    aria-label={`Mover columna ${columna.label} hacia abajo`}
                    className={`flex h-6 w-6 items-center justify-center text-xs leading-none text-muted-foreground hover:bg-border disabled:opacity-30 ${anilloFoco}`}
                  >
                    <span aria-hidden="true">▼</span>
                  </button>
                </div>
              </div>
            );
          })}
          <div role="group" aria-label="Densidad de las filas" className="mt-1 border-t border-border p-1">
            <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Densidad de las filas</p>
            <div className="flex gap-1 px-1 pb-1">
              {DENSIDADES.map(({ valor, etiqueta }) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={densidad === valor}
                  onClick={() => cambiarDensidad(valor)}
                  className={`min-h-8 flex-1 rounded-md px-2 py-1 text-xs font-medium ${anilloFoco} ${
                    densidad === valor ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-border"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
