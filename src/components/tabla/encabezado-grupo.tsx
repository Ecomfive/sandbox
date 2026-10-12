"use client";

import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";

/**
 * Encabezado de un grupo de una lista de tarjetas (no de una tabla): el mismo botón que se contrae y
 * expande, en un bloque en vez de una fila.
 */
export function EncabezadoGrupoBloque({
  contraido,
  alAlternar,
  etiqueta,
  cantidad,
  nombre,
  total,
}: {
  contraido: boolean;
  alAlternar: () => void;
  etiqueta: ReactNode;
  cantidad: number;
  nombre: NombreFilas;
  total?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={!contraido}
      onClick={alAlternar}
      className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
    >
      <ChevronRightIcon
        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
          contraido ? "" : "rotate-90"
        }`}
      />
      {etiqueta}
      <span className="text-xs font-normal text-muted-foreground tabular-nums">
        {cantidad} {cantidad === 1 ? nombre.singular : nombre.plural}
        {total !== undefined && <> · {total}</>}
      </span>
    </button>
  );
}

/**
 * Fila de encabezado de un grupo de la tabla: se contrae y expande, y resume cuántas filas trae y (si la
 * tabla define un total) cuánto suman. Va dentro de un <tbody> por grupo.
 */
export function EncabezadoGrupo({
  columnas,
  contraido,
  alAlternar,
  etiqueta,
  cantidad,
  nombre,
  total,
  casilla,
}: {
  /** Número de columnas de la tabla (la casilla incluida), para que la fila las abarque todas. */
  columnas: number;
  contraido: boolean;
  alAlternar: () => void;
  /** Nombre del grupo (texto o insignia). */
  etiqueta: ReactNode;
  cantidad: number;
  nombre: NombreFilas;
  /** Total ya formateado ("₡5 500,00"); sin él solo se cuenta. */
  total?: string;
  /**
   * Casilla que marca o desmarca todas las filas del grupo (solo en tablas con selección). Va en la misma columna que las
   * casillas de las filas; con algunas marcadas se ve a medias.
   */
  casilla?: { marcadas: number; alAlternar: () => void };
}) {
  const todas = cantidad > 0 && (casilla?.marcadas ?? 0) === cantidad;
  const boton = (
    <button
      type="button"
      aria-expanded={!contraido}
      onClick={alAlternar}
      className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none focus-visible:ring-inset"
    >
      <ChevronRightIcon
        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
          contraido ? "" : "rotate-90"
        }`}
      />
      {etiqueta}
      <span className="text-xs font-normal text-muted-foreground tabular-nums">
        {cantidad} {cantidad === 1 ? nombre.singular : nombre.plural}
        {total !== undefined && <> · {total}</>}
      </span>
    </button>
  );
  return (
    <tr className="border-b border-border bg-muted/40">
      {casilla && (
        <td className="w-10 border-r border-border/40 px-2 py-0">
          <label className="flex h-11 w-8 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              checked={todas}
              ref={(el) => {
                if (el) el.indeterminate = casilla.marcadas > 0 && !todas;
              }}
              onChange={casilla.alAlternar}
              disabled={cantidad === 0}
              aria-label={`Seleccionar todo el grupo: ${cantidad} ${cantidad === 1 ? nombre.singular : nombre.plural}`}
              className="h-4 w-4 cursor-pointer accent-foreground"
            />
          </label>
        </td>
      )}
      <th scope="colgroup" colSpan={casilla ? columnas - 1 : columnas} className="p-0 text-left font-normal">
        {boton}
      </th>
    </tr>
  );
}
