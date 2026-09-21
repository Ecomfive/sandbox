"use client";

import { anilloFoco } from "@/components/ui/field";
import { ChevronRightIcon } from "@/lib/nav-icons";
import { botonesDePagina, type PaginaCalculada } from "@/lib/tabla/paginacion";
import type { NombreFilas } from "@/lib/tabla/pie";

const BASE = `flex min-h-9 min-w-9 items-center justify-center !rounded-md px-2 text-sm font-medium tabular-nums transition-colors ${anilloFoco}`;

/**
 * Pie de una tabla paginada: qué filas se ven («Mostrando 51–100 de 136 retiros») y los botones de página con
 * flechas para ir a la anterior y a la siguiente. La página actual va marcada (`aria-current="page"`) y con otro
 * color; una flecha que no se puede usar queda deshabilitada. Los botones son de 36 px, no de 44: es el mismo
 * tamaño de una pastilla de la barra de herramientas más un poco de aire.
 */
export function Paginacion({
  pagina,
  nombre,
  alIrA,
}: {
  pagina: PaginaCalculada;
  nombre: NombreFilas;
  alIrA: (pagina: number) => void;
}) {
  if (pagina.totalPaginas <= 1) return null;
  const botones = botonesDePagina(pagina.pagina, pagina.totalPaginas);
  const primera = pagina.pagina === 1;
  const ultima = pagina.pagina === pagina.totalPaginas;

  return (
    <nav
      aria-label={`Paginación de ${nombre.plural}`}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-2"
    >
      <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
        Mostrando {pagina.desde}–{pagina.hasta} de {pagina.total} {nombre.plural}
      </p>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          <button
            type="button"
            onClick={() => alIrA(pagina.pagina - 1)}
            disabled={primera}
            aria-label="Página anterior"
            className={`${BASE} text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
          >
            <ChevronRightIcon className="h-4 w-4 rotate-180" />
          </button>
        </li>
        {botones.map((boton, i) =>
          boton === "…" ? (
            <li key={`salto-${i}`} aria-hidden="true" className="flex min-h-9 min-w-6 items-center justify-center text-muted-foreground">
              …
            </li>
          ) : (
            <li key={boton}>
              <button
                type="button"
                onClick={() => alIrA(boton)}
                aria-label={`Página ${boton}`}
                aria-current={boton === pagina.pagina ? "page" : undefined}
                className={`${BASE} ${
                  boton === pagina.pagina ? "bg-foreground text-background" : "text-foreground hover:bg-muted"
                }`}
              >
                {boton}
              </button>
            </li>
          )
        )}
        <li>
          <button
            type="button"
            onClick={() => alIrA(pagina.pagina + 1)}
            disabled={ultima}
            aria-label="Página siguiente"
            className={`${BASE} text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
