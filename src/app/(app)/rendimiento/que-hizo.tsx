"use client";

import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { Segmentado } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { NOMBRE_DISPOSITIVO, ZONA, duracion, etiquetaHora, horaPanama, tramosDelDia, type Bloque, type Dispositivo, type Jornada, type TramoDia } from "@/lib/rendimiento/jornada";
import { GraficaHoras } from "./grafica-horas";

export const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-PA", { timeZone: ZONA, hour: "numeric", minute: "2-digit" }) : "—");

/** «7:21 – 7:45 a. m.»: si las dos horas son de la misma mitad del día, «a. m.» va una vez. */
function rangoHoras(desde: string, hasta: string) {
  const fin = /\s*[ap]\.\s*m\.$/u;
  const a = hora(desde);
  const b = hora(hasta);
  return a.match(fin)?.[0].trim() === b.match(fin)?.[0].trim() ? `${a.replace(fin, "")} – ${b}` : `${a} – ${b}`;
}

/** Cada área siempre con su color: no depende de cuánto tiempo tuvo ni de qué otras áreas salen ese día. */
const COLOR_AREA: Record<string, string> = {
  CRM: "var(--area-1)",
  "IDs Dropi": "var(--area-2)",
  "IDs Drop y Effi": "var(--area-3)",
  Producto: "var(--area-4)",
  Compras: "var(--area-5)",
  Inventario: "var(--area-6)",
  "Pedidos y ventas": "var(--area-7)",
  Finanzas: "var(--area-8)",
};
export const colorDeArea = (area: string | null) => (area && COLOR_AREA[area]) || "var(--area-otras)";

const nombreDispositivo = (d: Dispositivo | null) => (d ? NOMBRE_DISPOSITIVO[d] : "Sin dato");

function plural(n: number, uno: string, varios: string) {
  return `${n.toLocaleString("es-PA")} ${n === 1 ? uno : varios}`;
}

/** Lo que dice un rato en palabras, para quien no ve los colores. */
const textoTramo = (t: TramoDia) => `${rangoHoras(t.desde, t.hasta)}, ${duracion(t.minutos)}${t.areas.length ? `, ${t.areas.map((a) => a.area).join(", ")}` : ""}`;

function PuntoArea({ area }: { area: string | null }) {
  return <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colorDeArea(area) }} />;
}

/** El minuto del día en Panamá. */
const minutoDelDia = (iso: string) => horaPanama(iso) * 60 + new Date(iso).getUTCMinutes();

/**
 * El día en una sola barra: cada rato de trabajo en su lugar real, con los colores de sus áreas y lo blanco como pausa. Va de la hora de entrada a la de salida. Pulsar un rato
 * lo abre en la lista; al pasar por encima, o con el teclado, la línea de abajo dice qué es.
 */
function LineaDelDia({ tramos, abiertos, alElegir }: { tramos: TramoDia[]; abiertos: Set<number>; alElegir: (i: number) => void }) {
  const [foco, setFoco] = useState<string | null>(null);
  const inicio = Math.floor(minutoDelDia(tramos[0].desde) / 60) * 60;
  const fin = Math.max(inicio + 60, Math.ceil(minutoDelDia(tramos.at(-1)!.hasta) / 60) * 60);
  const lugar = (iso: string) => ((minutoDelDia(iso) - inicio) / (fin - inicio)) * 100;
  const horas = Array.from({ length: (fin - inicio) / 60 + 1 }, (_, i) => inicio / 60 + i);
  const cada = horas.length > 13 ? 2 : 1;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-7 rounded-md bg-muted/60">
        {horas.slice(1, -1).map((h) => (
          <span key={h} aria-hidden="true" className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${((h * 60 - inicio) / (fin - inicio)) * 100}%` }} />
        ))}
        {tramos.map((t, i) => {
          const izquierda = lugar(t.desde);
          const ancho = Math.max(lugar(t.hasta) - izquierda, 0);
          return (
            <button
              key={t.desde}
              type="button"
              aria-expanded={abiertos.has(i)}
              aria-label={`Abrir el rato ${textoTramo(t)}`}
              onClick={() => alElegir(i)}
              onFocus={() => setFoco(textoTramo(t))}
              onBlur={() => setFoco(null)}
              onMouseLeave={() => setFoco(null)}
              className={`absolute inset-y-0 min-w-1.5 overflow-hidden rounded-[3px] ${abiertos.has(i) ? "ring-2 ring-foreground ring-offset-1 ring-offset-card" : ""} ${anilloFoco}`}
              style={{ left: `${izquierda}%`, width: `${ancho}%` }}
            >
              {t.bloques.map((b) => {
                const total = new Date(t.hasta).getTime() - new Date(t.desde).getTime();
                const desde = total ? ((new Date(b.desde).getTime() - new Date(t.desde).getTime()) / total) * 100 : 0;
                const largo = total ? ((new Date(b.hasta).getTime() - new Date(b.desde).getTime()) / total) * 100 : 100;
                return (
                  <span
                    key={b.desde}
                    aria-hidden="true"
                    onMouseEnter={() => setFoco(`${rangoHoras(b.desde, b.hasta)} · ${b.pagina ?? "Sin página anotada"}${b.area ? ` · ${b.area}` : ""}${b.minutos ? ` · ${duracion(b.minutos)}` : ""}`)}
                    className="absolute inset-y-0"
                    style={{ left: `${desde}%`, width: `${largo}%`, minWidth: 2, background: colorDeArea(b.area), boxShadow: "inset -1px 0 0 var(--card)" }}
                  />
                );
              })}
            </button>
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

/** Lo hecho en un bloque, por hora: lo guardado y los WhatsApp. */
function LoHecho({ b }: { b: Bloque }) {
  const cosas = [...b.acciones.map((a) => ({ momento: a.creadoEn, texto: a.texto })), ...b.mensajes.map((m) => ({ momento: m.primero, texto: `WhatsApp a ${m.chat}: ${plural(m.n, "mensaje", "mensajes")}` }))].sort((x, y) =>
    x.momento.localeCompare(y.momento),
  );
  if (!cosas.length) return null;
  return (
    <ul className="m-0 mt-0.5 flex list-none flex-col gap-0.5 p-0">
      {cosas.map((c, i) => (
        <li key={i} className="flex gap-2 text-[13px]">
          <span className="w-16 shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">{hora(c.momento)}</span>
          <span className="min-w-0 break-words">{c.texto}</span>
        </li>
      ))}
    </ul>
  );
}

/** El detalle de un rato: página por página, con el dispositivo y todo lo que hizo. */
function DetalleTramo({ t }: { t: TramoDia }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-2 border-l-2 border-border p-0 pl-3">
      {t.bloques.map((b) => (
        <li key={b.desde} className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
            <PuntoArea area={b.area} />
            <span className="text-muted-foreground tabular-nums">{b.minutos ? rangoHoras(b.desde, b.hasta) : hora(b.desde)}</span>
            <span className="font-medium">{b.pagina ?? "Sin página anotada"}</span>
            <span className="text-muted-foreground">{[b.area, b.minutos ? duracion(b.minutos) : null, b.minutos ? nombreDispositivo(b.dispositivo) : null].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="pl-4">
            <LoHecho b={b} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Flecha({ abierta }: { abierta: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${abierta ? "rotate-90" : ""}`}>
      <path d="m9 6 6 6-6 6" />
    </svg>
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
  const hecho = [t.acciones ? plural(t.acciones, "acción", "acciones") : null, t.mensajes ? `${t.mensajes.toLocaleString("es-PA")} WhatsApp` : null].filter(Boolean).join(" · ");
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
            <span className="flex items-center gap-x-3 whitespace-nowrap">
              {t.areas.slice(0, MAX_AREAS).map((a) => (
                <span key={a.area} className="inline-flex items-center gap-1.5">
                  <PuntoArea area={a.area} />
                  {a.area} <span className="text-muted-foreground tabular-nums">{duracion(a.minutos)}</span>
                </span>
              ))}
              {t.areas.length > MAX_AREAS && <span className="text-muted-foreground">+{t.areas.length - MAX_AREAS}</span>}
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
            <DetalleTramo t={t} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** «Qué hizo»: la línea del día y, debajo, un renglón por rato de trabajo que se abre con el detalle. Con el mismo espacio entra el día entero. «Por hora» es la gráfica de siempre. */
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
          {vista === "ratos" && <p className="m-0 text-[13px] text-muted-foreground">{plural(tramos.length, "rato de trabajo", "ratos de trabajo")}, separados por pausas de más de 5 minutos</p>}
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
        <GraficaHoras horas={j.horas} inicial={horaInicial} />
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
