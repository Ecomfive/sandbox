"use client";

import { useTransition } from "react";
import { Bandera } from "@/components/paises/bandera";
import { LOGO_PLATAFORMA } from "@/components/plataformas/selector-plataforma";
import { MenuDesplegable, TituloGrupoMenu, claseOpcionMenu } from "@/components/ui/menu-desplegable";
import { CheckIcon, ChevronRightIcon } from "@/lib/nav-icons";
import { PAISES_NAV } from "@/lib/nav-data";
import { setPaisActual } from "@/lib/pais-actions";
import { setPlataformaActual } from "@/lib/plataforma-actions";
import { plataformaDe, type Plataforma, type PlataformaId } from "@/lib/plataformas";

function GloboIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </svg>
  );
}

/**
 * Contexto de trabajo en la barra de arriba: el país y la plataforma («Costa Rica · Drop»), los dos se cambian aquí (3 nov 2026, pedido de Hernán: antes la plataforma solo se
 * mostraba). La plataforma es la misma que elige el selector de Análisis de competencia (comparten la cookie). `plataformas` son las que existen en el país: Drop es solo de Costa
 * Rica, así que con otro país no hay nada que elegir y la sección «Plataforma» ni se dibuja.
 */
export function SelectorContexto({ pais, plataforma, plataformas, permitidos = null }: { pais: string; plataforma: PlataformaId; plataformas: readonly Plataforma[]; permitidos?: string[] | null }) {
  // Solo los países que la persona puede ver (`null` = todos).
  const paises = permitidos === null ? PAISES_NAV : PAISES_NAV.filter((p) => permitidos.includes(p.codigo));
  const [pending, startTransition] = useTransition();
  const nombrePais = PAISES_NAV.find((p) => p.codigo === pais)?.nombre ?? pais;
  const nombrePlataforma = plataformaDe(plataforma).nombre;
  // Sin un país conocido (p. ej. «Sin país») queda el globo.
  const conBandera = PAISES_NAV.some((p) => p.codigo === pais);

  return (
    <MenuDesplegable
      etiqueta={`País y plataforma: ${nombrePais}, ${nombrePlataforma}`}
      claseBoton={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border border-border-control bg-card py-1 text-sm hover:bg-muted max-sm:w-8 sm:px-3 ${pending ? "opacity-60" : ""}`}
      contenidoBoton={
        <>
          {conBandera ? <Bandera codigo={pais} /> : <GloboIcon className="h-4 w-4 text-muted-foreground" />}
          <span className="hidden sm:inline">
            {nombrePais}
            <span className="text-muted-foreground"> · {nombrePlataforma}</span>
          </span>
          <ChevronRightIcon className="h-3.5 w-3.5 rotate-90 text-muted-foreground max-sm:hidden" />
        </>
      }
      claseMenu="w-64"
    >
      {(cerrar) => (
        <>
          <TituloGrupoMenu>País</TituloGrupoMenu>
          {paises.map((p) => (
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
              <Bandera codigo={p.codigo} />
              <span className={p.codigo === pais ? "font-semibold" : ""}>{p.nombre}</span>
              {p.codigo === pais && <CheckIcon className="ml-auto h-4 w-4 text-success" />}
              {p.pronto && <span className="ml-auto rounded-full border border-border px-2 text-[0.65rem] text-muted-foreground">Pronto</span>}
            </button>
          ))}
          {plataformas.length > 1 && (
            <>
            <div role="separator" className="my-1 border-t border-border" />
            <TituloGrupoMenu>Plataforma</TituloGrupoMenu>
            {plataformas.map((p) => {
              const Logo = LOGO_PLATAFORMA[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={p.id === plataforma}
                  onClick={() => {
                    cerrar(true);
                    if (p.id !== plataforma) startTransition(() => setPlataformaActual(p.id));
                  }}
                  className={claseOpcionMenu}
                >
                  <Logo marca className="h-4 w-4" />
                  <span className={p.id === plataforma ? "font-semibold" : ""}>{p.nombre}</span>
                  {p.id === plataforma && <CheckIcon className="ml-auto h-4 w-4 text-success" />}
                </button>
              );
            })}
            </>
          )}
        </>
      )}
    </MenuDesplegable>
  );
}
