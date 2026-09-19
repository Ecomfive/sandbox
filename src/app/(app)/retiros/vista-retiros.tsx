"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { AgruparIcon, CerradoIcon, CheckIcon, FlechaAbajoIcon, FlechaArribaIcon } from "@/lib/nav-icons";
import { ICONOS } from "./filtros-retiros";
import {
  CAMPOS_AGRUPABLES,
  VISTA_DEFECTO,
  etiquetaCampo,
  parsearVista,
  type CampoAgrupable,
  type OrdenGrupos,
  type Vista,
} from "./vista";

const ANCHO_MENU = 224; // w-56

const ORDENES: { id: OrdenGrupos; etiqueta: string; Icono: typeof FlechaArribaIcon }[] = [
  { id: "asc", etiqueta: "Ascendente", Icono: FlechaArribaIcon },
  { id: "desc", etiqueta: "Descendente", Icono: FlechaAbajoIcon },
];

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

/**
 * Misma familia que el botón de filtros: círculo gris de 32 px en reposo, oscuro cuando está activo.
 * Como en ClickUp, el botón nace compacto (solo ícono) y se despliega a pastilla con su texto al activarlo.
 */
const pastilla = (activa: boolean) =>
  `relative inline-flex h-8 items-center !rounded-full px-2 text-xs font-medium whitespace-nowrap transition-colors ${anilloFoco} ${
    activa ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
  }`;

/**
 * Ícono + texto que se despliega hacia un lado. Anima `grid-template-columns` (0fr → 1fr) para que el
 * ancho siga al contenido sin medirlo; con movimiento reducido el cambio es instantáneo.
 */
function Despliegue({ expandida, children }: { expandida: boolean; children: ReactNode }) {
  return (
    <span
      className={`grid transition-[grid-template-columns] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
        expandida ? "grid-cols-[1fr]" : "grid-cols-[0fr]"
      }`}
    >
      <span className="min-w-0 overflow-hidden whitespace-nowrap">
        <span
          className={`flex items-center gap-1.5 pr-1 pl-1.5 transition-opacity duration-150 motion-reduce:transition-none ${
            expandida ? "opacity-100" : "opacity-0"
          }`}
        >
          {children}
        </span>
      </span>
    </span>
  );
}

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
  const mostrarInsignia = !visibles && ocultos > 0;
  // El nombre accesible contiene el texto visible ("Cerrados") y suma lo que solo se ve como insignia o tooltip.
  const nombre = forzadoPorFiltro
    ? "Cerrados, los pide el filtro de Estado"
    : mostrarInsignia
      ? `Cerrados, ${ocultos} ${ocultos === 1 ? "oculto" : "ocultos"}`
      : "Cerrados";
  return (
    <button
      type="button"
      aria-pressed={visibles}
      aria-disabled={forzadoPorFiltro || undefined}
      aria-label={nombre}
      onClick={() => {
        if (!forzadoPorFiltro) alAlternar();
      }}
      title={titulo}
      className={`${pastilla(visibles)} ${forzadoPorFiltro ? "cursor-not-allowed" : ""}`}
    >
      <CerradoIcon className="h-4 w-4 shrink-0" />
      <Despliegue expandida={visibles}>Cerrados</Despliegue>
      {mostrarInsignia && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-border bg-card px-1 text-xs leading-none font-semibold text-foreground tabular-nums"
        >
          {ocultos}
        </span>
      )}
    </button>
  );
}

/**
 * "Agrupar": pastilla con el campo elegido; abre una lista para cambiar de campo o quitar la
 * agrupación, y —con grupos a la vista— contraerlos o expandirlos todos.
 */
export function BotonAgrupar({
  campo,
  orden,
  alElegir,
  alElegirOrden,
  hayGrupos,
  alContraerTodos,
  alExpandirTodos,
  alAbrir,
}: {
  campo: CampoAgrupable | null;
  orden: OrdenGrupos;
  alElegir: (campo: CampoAgrupable | null) => void;
  alElegirOrden: (orden: OrdenGrupos) => void;
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
      // La lista se ancla al borde derecho del botón (que no se mueve cuando el botón se despliega hacia la
      // izquierda); solo si no cabe hacia la izquierda, como en pantallas angostas, se ancla al borde izquierdo.
      const posicion = botonRef.current?.getBoundingClientRect();
      setAlineadoADerecha(posicion ? posicion.right >= ANCHO_MENU + 8 : true);
      alAbrir?.();
    }
    setAbierto((v) => !v);
  }

  function elegir(nuevo: CampoAgrupable | null) {
    alElegir(nuevo);
    setAbierto(false);
    botonRef.current?.focus();
  }

  function elegirOrden(nuevo: OrdenGrupos) {
    alElegirOrden(nuevo);
    setAbierto(false);
    botonRef.current?.focus();
  }

  const opcion = "flex min-h-9 w-full items-center gap-2.5 px-2 py-2 text-left text-sm hover:bg-muted";
  // Se despliega con un campo elegido o mientras la lista está abierta; al cerrarla sin campo vuelve a ser solo ícono.
  const expandida = campo !== null || abierto;
  const nombre = campo ? `Agrupar: ${etiquetaCampo(campo)}, ${orden === "asc" ? "ascendente" : "descendente"}` : "Agrupar";

  return (
    <div ref={contenedorRef} className="relative">
      <button
        ref={botonRef}
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-controls="menu-agrupar-retiros"
        aria-label={nombre}
        title="Agrupar por"
        className={pastilla(campo !== null)}
      >
        <AgruparIcon className="h-4 w-4 shrink-0" />
        <Despliegue expandida={expandida}>
          {campo ? (
            <>
              <span>
                Agrupar: <span className="font-semibold">{etiquetaCampo(campo)}</span>
              </span>
              {orden === "asc" ? (
                <FlechaArribaIcon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <FlechaAbajoIcon className="h-3.5 w-3.5 shrink-0" />
              )}
            </>
          ) : (
            "Agrupar"
          )}
        </Despliegue>
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
          {campo !== null && (
            <div role="group" aria-label="Orden de los grupos" className="mt-1 border-t border-border pt-1">
              <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Orden de los grupos</p>
              {ORDENES.map(({ id, etiqueta, Icono }) => {
                const activo = orden === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => elegirOrden(id)}
                    className={`${opcion} ${anilloFoco} ${activo ? "font-semibold" : ""}`}
                  >
                    <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{etiqueta}</span>
                    {activo && <CheckIcon className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
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
