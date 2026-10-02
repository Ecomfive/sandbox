"use client";

import { useTransition } from "react";
import { MenuDesplegable, TituloGrupoMenu, claseOpcionMenu } from "@/components/ui/menu-desplegable";
import { CheckIcon, ChevronRightIcon } from "@/lib/nav-icons";
import { PAISES_NAV } from "@/lib/nav-data";
import { setPaisActual } from "@/lib/pais-actions";

function GloboIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </svg>
  );
}

/**
 * Contexto de trabajo en la barra de arriba: el país (se cambia aquí) y la plataforma con datos («Panamá · Dropi»).
 * Antes el país era un selector suelto y la plataforma un nivel del menú lateral. Hoy la plataforma solo se muestra:
 * Dropi es la única con datos y las demás se activan cuando los tengan.
 */
export function SelectorContexto({ pais, plataforma }: { pais: string; plataforma: string | null }) {
  const [pending, startTransition] = useTransition();
  const nombrePais = PAISES_NAV.find((p) => p.codigo === pais)?.nombre ?? pais;

  return (
    <MenuDesplegable
      etiqueta={`País y plataforma: ${nombrePais}${plataforma ? `, ${plataforma}` : ""}`}
      claseBoton={`inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border-control bg-card px-3 py-1 text-sm hover:bg-muted ${pending ? "opacity-60" : ""}`}
      contenidoBoton={
        <>
          <GloboIcon className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline">
            {nombrePais}
            {plataforma ? <span className="text-muted-foreground"> · {plataforma}</span> : null}
          </span>
          <ChevronRightIcon className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
        </>
      }
      claseMenu="w-64"
    >
      {(cerrar) => (
        <>
          <TituloGrupoMenu>País</TituloGrupoMenu>
          {PAISES_NAV.map((p) => (
            <button
              key={p.codigo}
              type="button"
              role="menuitemradio"
              aria-checked={p.codigo === pais}
              disabled={p.pronto}
              onClick={() => {
                cerrar(true);
                if (p.codigo !== pais) startTransition(() => setPaisActual(p.codigo));
              }}
              className={claseOpcionMenu}
            >
              <span className={p.codigo === pais ? "font-semibold" : ""}>{p.nombre}</span>
              {p.codigo === pais && <CheckIcon className="ml-auto h-4 w-4 text-success" />}
              {p.pronto && <span className="ml-auto rounded-full border border-border px-2 text-[0.65rem] text-muted-foreground">Pronto</span>}
            </button>
          ))}
          <div role="separator" className="my-1 border-t border-border" />
          <TituloGrupoMenu>Plataforma</TituloGrupoMenu>
          {plataforma && (
            <p className="flex items-center gap-2.5 px-3 py-2 text-sm font-semibold">
              {plataforma}
              <CheckIcon className="ml-auto h-4 w-4 text-success" />
            </p>
          )}
          <p className="px-3 pt-0.5 pb-2 text-xs text-muted-foreground">Las demás plataformas aparecen cuando tengan datos.</p>
        </>
      )}
    </MenuDesplegable>
  );
}
