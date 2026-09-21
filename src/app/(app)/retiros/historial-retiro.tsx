"use client";

import { useEffect, useState } from "react";
import { obtenerActividadRetiro, type EventoRetiro } from "./actividad";
import { formatearFechaHoraCompleta } from "@/lib/formato";

/**
 * El historial de actividad de un retiro (creado, modificado, novedad, conciliado…). Va **siempre al final de la ficha**,
 * debajo de todo, incluidas las secciones de Conciliar y Novedad cuando están desplegadas. Pide sus eventos al montarse
 * y cada vez que sube `version` (algo de la ficha registró actividad nueva); mientras se vuelve a pedir se sigue viendo
 * la lista anterior, sin parpadeo.
 */
export function HistorialRetiro({ id, codigoPais, version }: { id: string; codigoPais: string; version: number }) {
  const [eventos, setEventos] = useState<EventoRetiro[] | null | undefined>(undefined);

  useEffect(() => {
    let vigente = true;
    obtenerActividadRetiro(id)
      .then((r) => vigente && setEventos("eventos" in r ? r.eventos : null))
      .catch(() => vigente && setEventos(null));
    return () => {
      vigente = false;
    };
  }, [id, version]);

  const cargando = eventos === undefined;

  return (
    <section aria-labelledby={`actividad-retiro-${id}`} aria-busy={cargando} className="border-t border-border p-4">
      <h3 id={`actividad-retiro-${id}`} className="mb-3 text-sm font-semibold">
        Historial
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
