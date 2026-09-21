"use client";

import { useRef } from "react";

/** Filas por página de las tablas paginadas, salvo que una pida otra cosa. */
export const POR_PAGINA = 50;

/**
 * Al cambiar de página se vuelve al principio de la tabla: si quien pulsó estaba abajo (donde están los botones de
 * página), no se queda mirando el final de la página nueva. `raiz` va en el contenedor de la tabla.
 */
export function useIrAPaginaArriba(irAPagina: (pagina: number) => void) {
  const raiz = useRef<HTMLDivElement>(null);
  function alIrA(pagina: number) {
    irAPagina(pagina);
    if (raiz.current && raiz.current.getBoundingClientRect().top < 0) {
      requestAnimationFrame(() => raiz.current?.scrollIntoView({ block: "start" }));
    }
  }
  return { raiz, alIrA };
}

/** Texto para el aviso oculto de la tabla: cuántas filas hay y, si está paginada, en qué página se está. */
export function textoEstadoTabla(
  nombre: { singular: string; plural: string },
  total: number,
  paginacion: { pagina: number; totalPaginas: number } | null
): string {
  const base = `${total} ${total === 1 ? nombre.singular : nombre.plural}`;
  return paginacion && paginacion.totalPaginas > 1 ? `${base}, página ${paginacion.pagina} de ${paginacion.totalPaginas}` : base;
}
