"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { VentanaBuscarImagen } from "@/components/buscar-imagen/ventana-buscar-imagen";
import type { Ambito } from "@/lib/imagen/buscar";
import { BuscarIcon, CamaraIcon } from "@/lib/nav-icons";

/**
 * La lupa de la barra de herramientas, como en ClickUp: un botón redondo que al pulsarlo se abre en un campo para buscar
 * (por código, nombre y los demás textos de la fila). Escape o la × lo borran y lo cierran; con algo escrito queda abierto
 * y marcado. Atajo: «/» abre la búsqueda si no se está escribiendo en otro campo.
 */
/** La cámara de «Buscar por imagen» (26 oct 2026): abre la ventana de la foto; con una búsqueda por imagen aplicada, un chip la quita. */
function BotonImagen({ imagen }: { imagen: BusquedaPorImagen }) {
  const [ventana, setVentana] = useState(false);
  return (
    <>
      {imagen.activa && (
        <button
          type="button"
          onClick={imagen.alQuitar}
          aria-label="Quitar la búsqueda por imagen"
          className={`flex h-8 items-center gap-1.5 rounded-full border border-primario bg-card px-3 text-[13px] text-foreground hover:bg-muted ${anilloFoco}`}
        >
          Por imagen <span aria-hidden="true">×</span>
        </button>
      )}
      <Tooltip texto="Buscar por imagen">
        <button
          type="button"
          aria-label="Buscar por imagen"
          onClick={() => setVentana(true)}
          className={`flex h-8 w-8 items-center justify-center !rounded-full text-muted-foreground transition-colors hover:bg-border hover:text-foreground ${imagen.activa ? "bg-accent text-foreground" : "bg-muted"} ${anilloFoco}`}
        >
          <CamaraIcon className="h-4 w-4" />
        </button>
      </Tooltip>
      {ventana && <VentanaBuscarImagen abierta alCerrar={() => setVentana(false)} ambitoPropio={imagen.ambito} alFiltrar={imagen.alFiltrar} />}
    </>
  );
}

export interface BusquedaPorImagen {
  ambito: Ambito;
  activa: boolean;
  alFiltrar: (ids: string[]) => void;
  alQuitar: () => void;
}

export function BotonBuscar({ valor, alCambiar, nombreFilas, imagen }: { valor: string; alCambiar: (v: string) => void; nombreFilas: string; imagen?: BusquedaPorImagen }) {
  const [abierto, setAbierto] = useState(valor !== "");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const escribiendo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "/" && !escribiendo && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setAbierto(true);
        requestAnimationFrame(() => campo.current?.focus());
      }
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);

  function cerrar() {
    alCambiar("");
    setAbierto(false);
  }

  if (!abierto) {
    return (
      <>
        <Tooltip texto="Buscar (/)">
          <button
            type="button"
            aria-label={`Buscar ${nombreFilas}`}
            onClick={() => setAbierto(true)}
            className={`flex h-8 w-8 items-center justify-center !rounded-full bg-muted text-muted-foreground transition-colors hover:bg-border hover:text-foreground ${anilloFoco}`}
          >
            <BuscarIcon className="h-4 w-4" />
          </button>
        </Tooltip>
        {imagen && <BotonImagen imagen={imagen} />}
      </>
    );
  }

  return (
    <>
    <label className={`flex h-8 w-64 max-w-full items-center gap-1.5 rounded-full border px-3 focus-within:ring-2 focus-within:ring-foreground ${valor ? "border-primario" : "border-border-control"} bg-card`}>
      <BuscarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={campo}
        type="search"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cerrar();
          }
        }}
        onBlur={() => !valor && setAbierto(false)}
        placeholder={`Buscar ${nombreFilas} por código o nombre`}
        aria-label={`Buscar ${nombreFilas}`}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {valor && (
        <button type="button" aria-label="Borrar la búsqueda" onClick={cerrar} className={`shrink-0 text-muted-foreground hover:text-foreground ${anilloFoco}`}>
          ×
        </button>
      )}
    </label>
    {imagen && <BotonImagen imagen={imagen} />}
    </>
  );
}
