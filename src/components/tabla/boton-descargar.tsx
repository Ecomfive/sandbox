"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { ChevronRightIcon, DescargarIcon } from "@/lib/nav-icons";
import { filasACsv, nombreArchivoCsv } from "@/lib/tabla/csv";
import type { DefTabla } from "@/lib/tabla/motor";

/** Una descarga que arma el servidor con más datos de los que la tabla tiene cargados (todo un período, todo el historial). */
export interface DescargaCompleta {
  href: string;
  /** Lo que dice la opción: «Todo el período». */
  etiqueta: string;
  /** Detalle en gris: «1 790 órdenes». */
  detalle?: string;
}

const OPCION =
  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none";

/**
 * «Descargar»: baja como CSV las filas que se ven ahora (con los filtros y en el orden de la pantalla). El
 * archivo se arma en el navegador con la definición de la tabla, sin pedirle nada al servidor. Lleva una
 * marca al principio (BOM) para que Excel lea bien los acentos.
 *
 * Si la tabla solo tiene cargada una parte de los datos (500 órdenes de 1 790; los últimos extractos) y el
 * servidor sabe armar el total, la página pasa `completa` y el botón ofrece las dos cosas en un menú pequeño:
 * «Lo que se ve» y la descarga completa. Es un solo botón: no hay un segundo enlace «Descargar CSV» al lado.
 */
export function BotonDescargar<F>({
  def,
  filas,
  nombreFilas,
  ayuda = "Descargar filas visibles",
  completa,
}: {
  def: DefTabla<F>;
  filas: F[];
  nombreFilas: string;
  /** Lo que dice el tooltip; cambia si lo que baja no son las filas visibles (p. ej. las seleccionadas). */
  ayuda?: string;
  completa?: DescargaCompleta;
}) {
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const vacio = filas.length === 0;
  const cantidad = `${filas.length} ${filas.length === 1 ? "fila" : "filas"}`;

  function descargar() {
    if (vacio) return;
    const contenido = "﻿" + filasACsv(def, filas);
    const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivoCsv(def.clave, new Date());
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
    mostrarToast(`Descargadas ${cantidad} (${nombreFilas})`);
  }

  // Menú abierto: el foco pasa a la primera opción; Escape o pulsar fuera lo cierran.
  useEffect(() => {
    if (!abierto) return;
    raiz.current?.querySelector<HTMLElement>("[data-opcion]")?.focus();
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setAbierto(false);
      boton.current?.focus();
    }
    function alPulsar(e: PointerEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("pointerdown", alPulsar);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("pointerdown", alPulsar);
    };
  }, [abierto]);

  if (!completa) {
    return (
      <Tooltip texto={vacio ? "No hay filas para descargar" : ayuda}>
        <button
          type="button"
          onClick={descargar}
          aria-disabled={vacio || undefined}
          aria-label={vacio ? "Descargar, no hay filas" : `Descargar ${cantidad} en CSV`}
          className={`flex min-h-8 items-center gap-1.5 !rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted ${anilloFoco} ${
            vacio ? "cursor-not-allowed opacity-60" : ""
          }`}
        >
          <DescargarIcon className="h-4 w-4" />
          Descargar
        </button>
      </Tooltip>
    );
  }

  return (
    <div
      ref={raiz}
      className="relative"
      onBlur={(e) => {
        // El foco salió del botón y del menú (Tab hacia fuera): se cierra.
        if (abierto && !raiz.current?.contains(e.relatedTarget as Node | null)) setAbierto(false);
      }}
    >
      <Tooltip texto="Elegir qué descargar">
        <button
          ref={boton}
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-label="Descargar, elegir qué bajar"
          className={`flex min-h-8 items-center gap-1.5 !rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted ${anilloFoco}`}
        >
          <DescargarIcon className="h-4 w-4" />
          Descargar
          <ChevronRightIcon className={`h-3 w-3 transition-transform motion-reduce:transition-none ${abierto ? "-rotate-90" : "rotate-90"}`} />
        </button>
      </Tooltip>
      {abierto && (
        <div
          role="group"
          aria-label="Qué descargar"
          className="absolute top-full right-0 z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-1.5 shadow-lg"
        >
          <button
            type="button"
            data-opcion=""
            disabled={vacio}
            onClick={() => {
              descargar();
              setAbierto(false);
              boton.current?.focus();
            }}
            className={`${OPCION} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span>Lo que se ve</span>
            <span className="text-xs text-muted-foreground tabular-nums">{vacio ? "sin filas" : cantidad}</span>
          </button>
          <a href={completa.href} download data-opcion="" onClick={() => setAbierto(false)} className={OPCION}>
            <span>{completa.etiqueta}</span>
            {completa.detalle && <span className="text-xs text-muted-foreground tabular-nums">{completa.detalle}</span>}
          </a>
        </div>
      )}
    </div>
  );
}
