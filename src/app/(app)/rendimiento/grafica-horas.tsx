"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { ZONA, duracion, etiquetaHora, rangoDeHoras, type HoraJornada } from "@/lib/rendimiento/jornada";

const ALTO = 160;
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("es-PA", { timeZone: ZONA, hour: "numeric", minute: "2-digit" });

/**
 * La jornada de una persona como dashboard (pedido de Alcides, 27 oct 2026): una barra por hora (los minutos activos, sobre 60) y,
 * al pulsar una, qué hizo en esa hora: en qué páginas estuvo y todo lo que guardó, con la hora de cada cosa. Las flechas del teclado
 * pasan de una hora a otra.
 */
export function GraficaHoras({ horas, inicial }: { horas: HoraJornada[]; inicial: number | null }) {
  const rango = rangoDeHoras(horas);
  const porHora = new Map(horas.map((h) => [h.hora, h]));
  const masActiva = [...horas].sort((a, b) => b.minutos + b.acciones.length - (a.minutos + a.acciones.length))[0]?.hora ?? rango[0];
  const [elegida, setElegida] = useState(inicial !== null && rango.includes(inicial) ? inicial : masActiva);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const actual = porHora.get(elegida);

  function moverCon(e: KeyboardEvent, i: number) {
    const siguiente = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (siguiente === null || siguiente < 0 || siguiente >= rango.length) return;
    e.preventDefault();
    setElegida(rango[siguiente]);
    botones.current[siguiente]?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="relative" style={{ height: ALTO + 24 }}>
          {/* Guías recesivas: 30 y 60 minutos. */}
          {[60, 30].map((m) => (
            <div key={m} aria-hidden="true" className="absolute inset-x-0 flex items-center gap-2" style={{ top: ALTO - (m / 60) * ALTO }}>
              <span className="w-12 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">{m} min</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          ))}
          <div role="group" aria-label="Minutos activos por hora" className="absolute top-0 right-0 bottom-0 left-14 flex gap-0.5">
            {rango.map((h, i) => {
              const x = porHora.get(h);
              const minutos = x?.minutos ?? 0;
              const acciones = x?.acciones.length ?? 0;
              const activa = h === elegida;
              const texto = `${etiquetaHora(h)}: ${minutos ? `${minutos} min activa` : "sin minutos"}${acciones ? `, ${acciones} ${acciones === 1 ? "acción" : "acciones"}` : ""}`;
              return (
                // El Tooltip envuelve en un span en línea: esta columna lo estira para que cada barra ocupe su parte del ancho.
                <div key={h} className="flex h-full min-w-0 flex-1 [&>span]:h-full [&>span]:w-full">
                <Tooltip texto={texto}>
                  <button
                    ref={(el) => {
                      botones.current[i] = el;
                    }}
                    type="button"
                    aria-pressed={activa}
                    aria-label={texto}
                    tabIndex={activa ? 0 : -1}
                    onClick={() => setElegida(h)}
                    onKeyDown={(e) => moverCon(e, i)}
                    className={`group relative flex h-full w-full min-w-0 flex-col items-center justify-end rounded-md ${activa ? "bg-muted" : "hover:bg-muted/60"} ${anilloFoco}`}
                  >
                    {acciones > 0 && (
                      <span aria-hidden="true" className="mb-1 rounded-full bg-primario-suave px-1.5 text-[10px] font-semibold text-primario tabular-nums">
                        {acciones}
                      </span>
                    )}
                    <span
                      aria-hidden="true"
                      className={`w-3/5 max-w-6 rounded-t-[4px] transition-colors ${activa ? "bg-primario" : minutos ? "bg-primario/45 group-hover:bg-primario/70" : "bg-border"}`}
                      style={{ height: minutos ? Math.max(3, (Math.min(60, minutos) / 60) * ALTO) : 2, marginBottom: 24 }}
                    />
                    <span aria-hidden="true" className={`absolute bottom-0 text-[11px] tabular-nums ${activa ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {etiquetaHora(h, true)}
                    </span>
                  </button>
                </Tooltip>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <section aria-live="polite" aria-labelledby="titulo-hora" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="titulo-hora" className="text-base font-semibold">
            {etiquetaHora(elegida)} – {etiquetaHora((elegida + 1) % 24)}
          </h3>
          <span className="text-sm text-muted-foreground tabular-nums">
            {actual?.minutos ? `${duracion(actual.minutos)} activa` : "Sin minutos en el sistema"} · {actual?.acciones.length ?? 0} {(actual?.acciones.length ?? 0) === 1 ? "acción" : "acciones"}
          </span>
        </div>
        {!actual ? (
          <p className="text-sm text-muted-foreground">No hizo nada en el sistema en esta hora.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Dónde estuvo</h4>
              {actual.paginas.length ? (
                <ul className="flex flex-col gap-2">
                  {actual.paginas.map((p) => (
                    <li key={p.pagina} className="flex flex-col gap-1">
                      <span className="flex justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{p.pagina}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">{p.minutos} min</span>
                      </span>
                      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primario" style={{ width: `${(p.minutos / 60) * 100}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Sin minutos anotados en esta hora.</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lo que hizo</h4>
              {actual.acciones.length ? (
                <ol className="flex flex-col divide-y divide-border">
                  {actual.acciones.map((a, i) => (
                    <li key={i} className="flex gap-3 py-2 text-sm first:pt-0">
                      <span className="w-20 shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">{horaDe(a.creadoEn)}</span>
                      <span className="min-w-0 break-words">{a.texto}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No guardó nada en esta hora.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
