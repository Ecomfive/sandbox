"use client";

import type { Orden, Sentido } from "@/lib/meta-ads/orden";

/** Un título de columna que ordena su tabla: la primera vez pone «lo mejor» arriba (el sentido propio de esa columna) y, al tocarlo de nuevo, lo invierte. */
export function ColumnaOrdenable({ criterio, texto, natural = "desc", clase, orden, alElegir }: { criterio: string; texto: string; natural?: Sentido; clase: string; orden: Orden | null; alElegir: (o: Orden) => void }) {
  const activa = orden?.criterio === criterio ? orden.sentido : null;
  return (
    <th scope="col" aria-sort={activa === null ? "none" : activa === "asc" ? "ascending" : "descending"} className={`${clase} font-medium`}>
      <button
        type="button"
        onClick={() => alElegir({ criterio, sentido: activa === null ? natural : activa === "asc" ? "desc" : "asc" })}
        title={`Ordenar por ${texto.toLowerCase()}`}
        className={`inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${activa ? "text-foreground" : ""}`}
      >
        {texto}
        <span aria-hidden="true" className="w-3 text-center">{activa === "asc" ? "↑" : activa === "desc" ? "↓" : "↕"}</span>
      </button>
    </th>
  );
}
