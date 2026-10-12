"use client";

import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { ChevronRightIcon } from "@/lib/nav-icons";
import { etiquetaFilasPorPagina, leerFilasPorPagina, MINIMO_FILAS_POR_PAGINA, OPCIONES_FILAS_POR_PAGINA, opcionMarcada } from "@/lib/tabla/filas-por-pagina";
import { botonesDePagina, type PaginaCalculada } from "@/lib/tabla/paginacion";
import { useFilasPorPagina } from "./usar-filas-por-pagina";
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
  const [, cambiarFilas] = useFilasPorPagina();
  // Con pocas filas no hay nada que elegir; pero con «todas» o 500 elegidas queda una sola página y el selector sigue ahí
  // para poder volver a un número menor.
  if (pagina.totalPaginas <= 1 && pagina.total <= MINIMO_FILAS_POR_PAGINA) return null;
  const botones = botonesDePagina(pagina.pagina, pagina.totalPaginas);
  const primera = pagina.pagina === 1;
  const ultima = pagina.pagina === pagina.totalPaginas;
  const marcada = opcionMarcada(pagina.tamano);

  return (
    <nav
      aria-label={`Paginación de ${nombre.plural}`}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-2"
    >
      {/* Sin aria-live: al cambiar de página ya lo anuncia el aviso oculto de la tabla («136 retiros, página 2 de 3»). */}
      <p className="text-xs text-muted-foreground tabular-nums">
        Mostrando {pagina.desde}–{pagina.hasta} de {pagina.total} {nombre.plural}
      </p>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Filas por página
        <select
          value={marcada === null ? "" : String(marcada)}
          onChange={(e) => {
            const elegida = leerFilasPorPagina(e.target.value);
            if (elegida !== null) cambiarFilas(elegida);
          }}
          className={`${fieldClassSm} w-auto py-1`}
        >
          {marcada === null && (
            <option value="" disabled>
              {pagina.tamano}
            </option>
          )}
          {OPCIONES_FILAS_POR_PAGINA.map((o) => (
            <option key={o} value={String(o)}>
              {etiquetaFilasPorPagina(o)}
            </option>
          ))}
        </select>
      </label>
      {pagina.totalPaginas > 1 && <ul className="flex flex-wrap items-center gap-1">
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
                  boton === pagina.pagina ? "bg-primario text-white" : "text-foreground hover:bg-muted"
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
      </ul>}
    </nav>
  );
}
