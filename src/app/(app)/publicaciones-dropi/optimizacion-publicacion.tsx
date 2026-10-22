"use client";

import { Seccion } from "@/components/ui/seccion-ficha";
import { CheckIcon, EstadoIcon } from "@/lib/nav-icons";
import type { EstadoRevision } from "@/lib/publicaciones/optimizacion";
import type { FilaPublicacion } from "./def-publicaciones";

/** Cómo se marca cada punto: no solo con color (ícono o punto + texto). */
const MARCA: Record<EstadoRevision, { texto: string; clase: string }> = {
  ok: { texto: "Cumple", clase: "text-success" },
  falta: { texto: "Falta", clase: "text-destructive" },
  revisar: { texto: "Revisar", clase: "text-warning" },
  sin_datos: { texto: "Sin datos", clase: "text-muted-foreground" },
  no_aplica: { texto: "No aplica", clase: "text-muted-foreground" },
};

/**
 * El bloque «Optimización» de la ficha: cada punto de lo que se publica en Dropi (título, fotos, video, descripción, precio
 * sugerido) con si cumple, y la nota. Lo que falta sale también como recomendación arriba.
 */
export function OptimizacionFicha({ p }: { p: FilaPublicacion }) {
  return (
    <div className="border-b border-border px-5 py-5">
      <Seccion icono={EstadoIcon} titulo="Optimización en Dropi">
        <p className="m-0 text-sm">
          <span className="font-semibold tabular-nums">
            {p.nota.cumple} de {p.nota.total}
          </span>{" "}
          puntos cumplidos
          {p.tituloDropi && p.tituloDropi !== p.nombre && <span className="block text-xs text-muted-foreground">En Dropi se ve como «{p.tituloDropi}»</span>}
        </p>
        <ul className="m-0 grid list-none gap-x-6 gap-y-2 p-0 sm:grid-cols-2">
          {p.revisiones.map((r) => {
            const m = MARCA[r.estado];
            return (
              <li key={r.clave} className="flex min-w-0 gap-2 text-sm">
                {r.estado === "ok" ? (
                  <CheckIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.estado === "falta" ? "bg-destructive" : r.estado === "revisar" ? "bg-warning" : "bg-border-control"}`} />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">
                    {r.etiqueta} <span className={`text-xs font-normal ${m.clase}`}>· {m.texto}</span>
                  </span>
                  <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{r.detalle}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Seccion>
    </div>
  );
}
