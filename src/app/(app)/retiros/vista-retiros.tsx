"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { anilloFoco } from "@/components/ui/field";
import { AgruparIcon, CerradoIcon, CheckIcon } from "@/lib/nav-icons";
import { ICONOS } from "./filtros-retiros";
import {
  CAMPOS_AGRUPABLES,
  VISTA_DEFECTO,
  etiquetaCampo,
  parsearVista,
  type CampoAgrupable,
  type Vista,
} from "./vista";

// La vista vive en localStorage: cada persona conserva la suya al volver a la página.
const CLAVE_STORAGE = "retiros-vista-v1";
const oyentes = new Set<() => void>();
let vistaEnMemoria: string | null = null;

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

function leerVistaGuardada(): string {
  if (vistaEnMemoria !== null) return vistaEnMemoria;
  try {
    return localStorage.getItem(CLAVE_STORAGE) ?? "";
  } catch {
    return "";
  }
}

function guardarVista(json: string) {
  vistaEnMemoria = json;
  try {
    localStorage.setItem(CLAVE_STORAGE, json);
  } catch {
    // Sin localStorage (modo privado, cuotas) la vista funciona mientras no se recargue la página.
  }
  oyentes.forEach((avisar) => avisar());
}

export function useVistaRetiros(): [Vista, (cambio: Partial<Vista>) => void] {
  const json = useSyncExternalStore(suscribir, leerVistaGuardada, () => "");
  const vista = useMemo(() => (json === "" ? VISTA_DEFECTO : parsearVista(json)), [json]);
  const cambiar = useCallback(
    (cambio: Partial<Vista>) => guardarVista(JSON.stringify({ ...parsearVista(leerVistaGuardada()), ...cambio })),
    []
  );
  return [vista, cambiar];
}

/** Misma familia que el botón de filtros: gris en reposo, oscuro cuando está activo. */
const pastilla = (activa: boolean) =>
  `inline-flex min-h-8 items-center gap-1.5 !rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${anilloFoco} ${
    activa ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
  }`;

/**
 * "Cerrados": muestra u oculta al instante los retiros en estado Cerrado (como en ClickUp).
 * Si un filtro de Estado ya pide los cerrados, el botón queda fijo en "activo" y lo explica.
 */
export function BotonCerrados({
  visibles,
  forzadoPorFiltro,
  ocultos,
  alAlternar,
}: {
  visibles: boolean;
  forzadoPorFiltro: boolean;
  ocultos: number;
  alAlternar: () => void;
}) {
  const titulo = forzadoPorFiltro
    ? "Se ven porque el filtro de Estado incluye Cerrado"
    : visibles
      ? "Ocultar retiros cerrados"
      : "Mostrar retiros cerrados";
  return (
    <button
      type="button"
      aria-pressed={visibles}
      aria-disabled={forzadoPorFiltro || undefined}
      onClick={() => {
        if (!forzadoPorFiltro) alAlternar();
      }}
      title={titulo}
      className={`${pastilla(visibles)} ${forzadoPorFiltro ? "cursor-not-allowed" : ""}`}
    >
      <CerradoIcon className="h-4 w-4" />
      Cerrados
      {!visibles && ocultos > 0 && <span className="tabular-nums">{ocultos}</span>}
      {forzadoPorFiltro && <span className="sr-only">(los pide el filtro de Estado)</span>}
    </button>
  );
}

/**
 * "Agrupar": pastilla con el campo elegido; abre una lista para cambiar de campo o quitar la
 * agrupación, y —con grupos a la vista— contraerlos o expandirlos todos.
 */
export function BotonAgrupar({
  campo,
  alElegir,
  hayGrupos,
  alContraerTodos,
  alExpandirTodos,
  alAbrir,
}: {
  campo: CampoAgrupable | null;
  alElegir: (campo: CampoAgrupable | null) => void;
  hayGrupos: boolean;
  alContraerTodos: () => void;
  alExpandirTodos: () => void;
  alAbrir?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [alineadoADerecha, setAlineadoADerecha] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);

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

  function alternar() {
    if (!abierto) {
      // Si el botón cae en la mitad derecha (barra que se envuelve en pantallas angostas), la lista se abre hacia la izquierda.
      const posicion = botonRef.current?.getBoundingClientRect();
      setAlineadoADerecha(posicion ? posicion.left > window.innerWidth / 2 : false);
      alAbrir?.();
    }
    setAbierto((v) => !v);
  }

  function elegir(nuevo: CampoAgrupable | null) {
    alElegir(nuevo);
    setAbierto(false);
    botonRef.current?.focus();
  }

  const opcion = "flex min-h-9 w-full items-center gap-2.5 px-2 py-2 text-left text-sm hover:bg-muted";

  return (
    <div ref={contenedorRef} className="relative">
      <button
        ref={botonRef}
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-controls="menu-agrupar-retiros"
        className={pastilla(campo !== null)}
      >
        <AgruparIcon className="h-4 w-4" />
        {campo ? (
          <>
            Agrupar: <span className="font-semibold">{etiquetaCampo(campo)}</span>
          </>
        ) : (
          "Agrupar"
        )}
      </button>
      {abierto && (
        <div
          id="menu-agrupar-retiros"
          role="group"
          aria-label="Agrupar por"
          className={`absolute z-20 mt-1 w-56 rounded-xl border border-border bg-card p-1 text-foreground shadow-lg ${
            alineadoADerecha ? "right-0" : "left-0"
          }`}
        >
          <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Agrupar por</p>
          {CAMPOS_AGRUPABLES.map((id) => {
            const Icono = ICONOS[id];
            const activo = campo === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={activo}
                onClick={() => elegir(id)}
                className={`${opcion} ${anilloFoco} ${activo ? "font-semibold" : ""}`}
              >
                <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{etiquetaCampo(id)}</span>
                {activo && <CheckIcon className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={campo === null}
            onClick={() => elegir(null)}
            className={`${opcion} ${anilloFoco} ${campo === null ? "font-semibold" : ""}`}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">Sin agrupar</span>
            {campo === null && <CheckIcon className="h-4 w-4 shrink-0" />}
          </button>
          {hayGrupos && (
            <div className="mt-1 flex gap-1 border-t border-border pt-1">
              <button
                type="button"
                onClick={alContraerTodos}
                className={`min-h-8 flex-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
              >
                Contraer todos
              </button>
              <button
                type="button"
                onClick={alExpandirTodos}
                className={`min-h-8 flex-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
              >
                Expandir todos
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
