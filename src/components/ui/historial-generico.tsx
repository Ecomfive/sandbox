"use client";

import { useEffect, useState } from "react";
import { formatearFechaHoraCompleta } from "@/lib/formato";

export interface EventoHistorial {
  id: string;
  evento: string;
  creadoEn: string;
}

/**
 * La línea de tiempo de un registro (dropshipper, SKU, alerta...), igual que `HistorialRetiro`: siempre al final
 * de la ficha, un punto por evento con su texto y fecha. Pide los eventos al montarse y cada vez que sube
 * `version` (algo de la ficha registró actividad nueva); mientras se vuelve a pedir se sigue viendo la lista
 * anterior, sin parpadeo. `obtener` es la acción de lectura del propio módulo (basta poder abrir la sección;
 * devuelve el error como valor) — se le pasa como prop porque este componente ya es de cliente.
 */
export function HistorialGenerico({
  id,
  codigoPais,
  version = 0,
  titulo = "Actividad",
  obtener,
}: {
  id: string;
  codigoPais: string;
  version?: number;
  titulo?: string;
  obtener: (id: string) => Promise<{ eventos: EventoHistorial[] } | { error: string }>;
}) {
  const [eventos, setEventos] = useState<EventoHistorial[] | null | undefined>(undefined);

  useEffect(() => {
    let vigente = true;
    obtener(id)
      .then((r) => vigente && setEventos("eventos" in r ? r.eventos : null))
      .catch(() => vigente && setEventos(null));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, version]);

  const cargando = eventos === undefined;

  return (
    <section aria-labelledby={`actividad-${id}`} aria-busy={cargando} className="border-t border-border p-5">
      <h3 id={`actividad-${id}`} className="mb-3 text-sm font-semibold">
        {titulo}
      </h3>
      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : eventos === null ? (
        <p className="text-sm text-destructive">No se pudo cargar la actividad. Vuelve a intentarlo.</p>
      ) : eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay actividad registrada.</p>
      ) : (
        <ol className="flex flex-col gap-3 text-sm">
          {eventos.map((e) => (
            <li key={e.id} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
              <div>
                <p>{e.evento}</p>
                <p className="text-xs text-muted-foreground">{formatearFechaHoraCompleta(e.creadoEn, codigoPais)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
