"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { anilloFoco } from "@/components/ui/field";
import { duracion, etiquetaHora, type HoraJornada } from "@/lib/rendimiento/jornada";
import { ListaHecho, cosasDe, plural } from "./piezas-ficha";

const mensajesDe = (h: HoraJornada) => h.mensajes.reduce((t, m) => t + m.n, 0);
const cuantoHizo = (h: HoraJornada) => h.acciones.length + mensajesDe(h);

/**
 * La jornada hora por hora (pedido de Alcides, 27 oct 2026; compacta desde el 6 nov, pedido de Hernán): a la izquierda solo las horas con actividad, cada una con su barra de minutos;
 * a la derecha, lo de la hora elegida, con el mismo alto para que nada quede en blanco. Las flechas del teclado pasan de una hora a otra.
 */
export function PorHora({ horas, inicial }: { horas: HoraJornada[]; inicial: number | null }) {
  const masActiva = [...horas].sort((a, b) => b.minutos + cuantoHizo(b) - (a.minutos + cuantoHizo(a)))[0]?.hora ?? 0;
  const [elegida, setElegida] = useState(horas.some((h) => h.hora === inicial) ? (inicial as number) : masActiva);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const actual = horas.find((h) => h.hora === elegida);

  function moverCon(e: KeyboardEvent, i: number) {
    const siguiente = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : null;
    if (siguiente === null || siguiente < 0 || siguiente >= horas.length) return;
    e.preventDefault();
    setElegida(horas[siguiente].hora);
    botones.current[siguiente]?.focus();
  }

  if (!actual) return <p className="m-0 text-sm text-muted-foreground">Sin actividad anotada este día.</p>;
  const cosas = cosasDe(actual);
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
      <div role="group" aria-label="Minutos activos por hora" className="flex min-w-0 flex-col self-start rounded-lg border border-border p-1">
        {horas.map((h, i) => {
          const activa = h.hora === elegida;
          const hecho = cuantoHizo(h);
          return (
            <button
              key={h.hora}
              ref={(el) => {
                botones.current[i] = el;
              }}
              type="button"
              aria-pressed={activa}
              aria-label={`${etiquetaHora(h.hora)}: ${h.minutos ? `${duracion(h.minutos)} activa` : "sin minutos"}${hecho ? `, ${plural(hecho, "cosa hecha", "cosas hechas")}` : ""}`}
              tabIndex={activa ? 0 : -1}
              onClick={() => setElegida(h.hora)}
              onKeyDown={(e) => moverCon(e, i)}
              className={`grid h-8 w-full grid-cols-[4.25rem_minmax(0,1fr)_3.75rem_2.5rem] items-center gap-2 rounded-md px-2 text-[13px] ${activa ? "bg-accent font-medium" : "hover:bg-muted/60"} ${anilloFoco}`}
            >
              <span className="text-left whitespace-nowrap tabular-nums">{etiquetaHora(h.hora)}</span>
              <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-muted">
                <span className={`block h-full rounded-full ${activa ? "bg-primario" : "bg-primario/60"}`} style={{ width: `${(Math.min(60, h.minutos) / 60) * 100}%` }} />
              </span>
              <span className="text-right whitespace-nowrap text-muted-foreground tabular-nums">{h.minutos ? `${h.minutos} min` : "—"}</span>
              <span className="text-right text-xs font-medium text-primario tabular-nums">{hecho || ""}</span>
            </button>
          );
        })}
      </div>

      <section aria-live="polite" aria-label={`Lo que hizo a las ${etiquetaHora(elegida)}`} className="flex max-h-[26rem] min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h5 className="m-0 text-sm font-semibold tabular-nums">
            {etiquetaHora(elegida)} – {etiquetaHora((elegida + 1) % 24)}
          </h5>
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {actual.minutos ? `${duracion(actual.minutos)} activa` : "Sin minutos anotados"} · {plural(cosas.length, "registro", "registros")}
          </span>
        </div>
        {actual.paginas.length > 0 && (
          <ul aria-label="Dónde estuvo" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {actual.paginas.map((p) => (
              <li key={p.pagina} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {p.pagina} <span className="text-muted-foreground tabular-nums">{p.minutos} min</span>
              </li>
            ))}
          </ul>
        )}
        {cosas.length ? (
          <div tabIndex={0} role="region" aria-label="Lo que hizo en esta hora" className={`min-h-0 flex-1 overflow-y-auto rounded border-t border-border pt-1.5 ${anilloFoco}`}>
            <ListaHecho cosas={cosas} />
          </div>
        ) : (
          <p className="m-0 text-[13px] text-muted-foreground">No guardó nada en esta hora.</p>
        )}
      </section>
    </div>
  );
}
