"use client";

import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { Segmentado } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { NOMBRE_DISPOSITIVO, duracion, etiquetaHora, horaPanama, tramosDelDia, type Bloque, type Dispositivo, type Jornada, type TramoDia } from "@/lib/rendimiento/jornada";
import { Flecha, ListaHecho, cosasDe, hora, plural, rangoHoras } from "./piezas-ficha";
import { PorHora } from "./por-hora";

const nombreDispositivo = (d: Dispositivo | null) => (d ? NOMBRE_DISPOSITIVO[d] : "Sin dato");

/** Lo hecho en un rato, en palabras: «2 acciones · 3 WhatsApp». */
const textoHecho = (t: TramoDia) => [t.acciones ? plural(t.acciones, "acción", "acciones") : null, t.mensajes ? `${t.mensajes.toLocaleString("es-PA")} WhatsApp` : null].filter(Boolean).join(" · ");

/** Lo que dice un rato en palabras: la línea del día no lo escribe sobre la barra. */
function textoTramo(t: TramoDia) {
  return [t.minutos ? rangoHoras(t.desde, t.hasta) : hora(t.desde), t.minutos ? duracion(t.minutos) : null, t.areas.map((a) => a.area).join(", ") || null, textoHecho(t) || null].filter(Boolean).join(" · ");
}

/** El minuto del día en Panamá. */
const minutoDelDia = (iso: string) => horaPanama(iso) * 60 + new Date(iso).getUTCMinutes();

/**
 * El día en una sola barra, de la entrada a la salida: cada rato de trabajo en su lugar real y lo vacío es pausa. Un solo tono: lo que importa es cuándo trabajó, y las áreas van escritas
 * abajo. Pulsar un rato lo abre en la lista; al pasar por encima, o con el teclado, la línea de abajo dice qué es.
 */
function LineaDelDia({ tramos, abiertos, alElegir }: { tramos: TramoDia[]; abiertos: Set<number>; alElegir: (i: number) => void }) {
  const [foco, setFoco] = useState<string | null>(null);
  const inicio = Math.floor(minutoDelDia(tramos[0].desde) / 60) * 60;
  const fin = Math.max(inicio + 60, Math.ceil(minutoDelDia(tramos.at(-1)!.hasta) / 60) * 60);
  const lugar = (iso: string) => ((minutoDelDia(iso) - inicio) / (fin - inicio)) * 100;
  const horas = Array.from({ length: (fin - inicio) / 60 + 1 }, (_, i) => inicio / 60 + i);
  const cada = horas.length > 13 ? 2 : 1;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-6 rounded-md bg-muted/70">
        {horas.slice(1, -1).map((h) => (
          <span key={h} aria-hidden="true" className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${((h * 60 - inicio) / (fin - inicio)) * 100}%` }} />
        ))}
        {tramos.map((t, i) => {
          const izquierda = lugar(t.desde);
          const abierto = abiertos.has(i);
          return (
            <button
              key={t.desde}
              type="button"
              aria-expanded={abierto}
              aria-label={`Abrir el rato ${textoTramo(t)}`}
              onClick={() => alElegir(i)}
              onFocus={() => setFoco(textoTramo(t))}
              onBlur={() => setFoco(null)}
              onMouseEnter={() => setFoco(textoTramo(t))}
              onMouseLeave={() => setFoco(null)}
              className={`absolute inset-y-1 min-w-1.5 rounded-[4px] transition-colors motion-reduce:transition-none ${abierto ? "bg-primario" : "bg-primario/55 hover:bg-primario"} ${anilloFoco}`}
              style={{ left: `${izquierda}%`, width: `${Math.max(lugar(t.hasta) - izquierda, 0)}%` }}
            />
          );
        })}
      </div>
      <div aria-hidden="true" className="relative h-4 text-[11px] text-muted-foreground tabular-nums">
        {horas.map((h, i) =>
          i % cada ? null : (
            <span key={h} className={`absolute ${i === 0 ? "" : i === horas.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${((h * 60 - inicio) / (fin - inicio)) * 100}%` }}>
              {etiquetaHora(h % 24, true)}
            </span>
          ),
        )}
      </div>
      <p aria-live="polite" className="m-0 min-h-5 truncate text-[13px] text-muted-foreground">
        {foco ?? "Pasa el cursor por la línea para ver cada rato. Pulsa uno para abrirlo abajo."}
      </p>
    </div>
  );
}

function BloqueDelRato({ b }: { b: Bloque }) {
  const cosas = cosasDe(b);
  return (
    <li className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
        <span className="text-muted-foreground tabular-nums">{b.minutos ? rangoHoras(b.desde, b.hasta) : hora(b.desde)}</span>
        <span className="font-medium">{b.pagina ?? "Sin página anotada"}</span>
        <span className="text-muted-foreground">{[b.area, b.minutos ? duracion(b.minutos) : null, b.minutos ? nombreDispositivo(b.dispositivo) : null].filter(Boolean).join(" · ")}</span>
      </div>
      {cosas.length > 0 && (
        <div className="pl-3">
          <ListaHecho cosas={cosas} />
        </div>
      )}
    </li>
  );
}

const MAX_AREAS = 3;
const CELDA = "px-2 py-1.5 align-middle";

function Th({ children, clase = "" }: { children: ReactNode; clase?: string }) {
  return (
    <th scope="col" className={`px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase ${clase}`}>
      {children}
    </th>
  );
}

function FilaTramo({ t, abierta, alPulsar, fila }: { t: TramoDia; abierta: boolean; alPulsar: () => void; fila: (el: HTMLTableRowElement | null) => void }) {
  const hecho = textoHecho(t);
  return (
    <Fragment>
      <tr ref={fila} onClick={alPulsar} className={`cursor-pointer border-t border-border text-[13px] ${abierta ? "bg-accent" : "hover:bg-muted/50"}`}>
        <td className={CELDA}>
          <button
            type="button"
            aria-expanded={abierta}
            onClick={(e) => {
              e.stopPropagation();
              alPulsar();
            }}
            className={`flex items-center gap-1 rounded text-left whitespace-nowrap tabular-nums ${anilloFoco}`}
          >
            <Flecha abierta={abierta} />
            {t.minutos ? rangoHoras(t.desde, t.hasta) : hora(t.desde)}
          </button>
        </td>
        <td className={`${CELDA} font-medium whitespace-nowrap tabular-nums`}>{t.minutos ? duracion(t.minutos) : "—"}</td>
        <td className={`${CELDA} hidden md:table-cell`}>
          {t.areas.length ? (
            <span className="flex items-center gap-x-1.5 whitespace-nowrap">
              {t.areas.slice(0, MAX_AREAS).map((a, i) => (
                <Fragment key={a.area}>
                  {i > 0 && (
                    <span aria-hidden="true" className="text-muted-foreground/60">
                      ·
                    </span>
                  )}
                  <span>
                    {a.area} <span className="text-muted-foreground tabular-nums">{duracion(a.minutos)}</span>
                  </span>
                </Fragment>
              ))}
              {t.areas.length > MAX_AREAS && <span className="pl-1 text-muted-foreground">+{t.areas.length - MAX_AREAS}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">Sin página anotada</span>
          )}
        </td>
        <td className={`${CELDA} hidden whitespace-nowrap text-muted-foreground lg:table-cell`}>{t.dispositivos.map(nombreDispositivo).join(" y ") || "—"}</td>
        <td className={`${CELDA} whitespace-nowrap`}>{hecho ? <span className="rounded-full bg-primario-suave px-2 py-0.5 text-xs font-medium text-primario">{hecho}</span> : <span className="text-muted-foreground">—</span>}</td>
        <td className={`${CELDA} hidden whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell`}>{t.pausaDespues ? duracion(t.pausaDespues) : "—"}</td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={6} className="bg-muted/30 px-4 py-2.5 whitespace-normal">
            <ol className="m-0 flex list-none flex-col gap-2 border-l-2 border-primario/40 p-0 pl-3">
              {t.bloques.map((b) => (
                <BloqueDelRato key={b.desde} b={b} />
              ))}
            </ol>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** «Qué hizo»: la línea del día y, debajo, un renglón por rato de trabajo que se abre con el detalle. «Por hora» muestra lo mismo, hora por hora. */
export function QueHizo({ j, horaInicial }: { j: Jornada; horaInicial: number | null }) {
  const [vista, setVista] = useState<"ratos" | "horas">(horaInicial === null ? "ratos" : "horas");
  const tramos = useMemo(() => tramosDelDia(j.bloques), [j.bloques]);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const filas = useRef<(HTMLTableRowElement | null)[]>([]);

  function alternar(i: number) {
    setAbiertos((a) => {
      const nuevo = new Set(a);
      if (!nuevo.delete(i)) nuevo.add(i);
      return nuevo;
    });
  }
  function elegirEnLinea(i: number) {
    alternar(i);
    if (!abiertos.has(i)) filas.current[i]?.scrollIntoView({ block: "nearest" });
  }

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Qué hizo</h4>
          <p className="m-0 text-[13px] text-muted-foreground">{vista === "ratos" ? `${plural(tramos.length, "rato de trabajo", "ratos de trabajo")}, separados por pausas de más de 5 minutos` : `${plural(j.horas.length, "hora con actividad", "horas con actividad")}: elige una para ver el detalle`}</p>
        </div>
        <Segmentado
          etiqueta="Cómo ver lo que hizo"
          opciones={[
            { valor: "ratos", etiqueta: "Por ratos" },
            { valor: "horas", etiqueta: "Por hora" },
          ]}
          valor={vista}
          alCambiar={setVista}
        />
      </div>
      {vista === "horas" ? (
        <PorHora horas={j.horas} inicial={horaInicial} />
      ) : tramos.length ? (
        <>
          <LineaDelDia tramos={tramos} abiertos={abiertos} alElegir={elegirEnLinea} />
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Horario</Th>
                  <Th>Activo</Th>
                  <Th clase="hidden md:table-cell">Áreas</Th>
                  <Th clase="hidden lg:table-cell">Dispositivo</Th>
                  <Th>Hecho</Th>
                  <Th clase="hidden sm:table-cell">Pausa después</Th>
                </tr>
              </thead>
              <tbody>
                {tramos.map((t, i) => (
                  <FilaTramo
                    key={t.desde}
                    t={t}
                    abierta={abiertos.has(i)}
                    alPulsar={() => alternar(i)}
                    fila={(el) => {
                      filas.current[i] = el;
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">Sin actividad anotada este día.</p>
      )}
    </section>
  );
}
