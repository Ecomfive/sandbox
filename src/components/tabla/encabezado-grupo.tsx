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
}: {
  /** Número de columnas de la tabla, para que la fila las abarque todas. */
  columnas: number;
  contraido: boolean;
  alAlternar: () => void;
  /** Nombre del grupo (texto o insignia). */
  etiqueta: ReactNode;
  cantidad: number;
  nombre: NombreFilas;
  /** Total ya formateado ("₡5 500,00"); sin él solo se cuenta. */
  total?: string;
}) {
  return (
    <tr className="border-b border-border bg-muted/40">
      <th scope="colgroup" colSpan={columnas} className="p-0 text-left font-normal">
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
      </th>
    </tr>
  );
}
