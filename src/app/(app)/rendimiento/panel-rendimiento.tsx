"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Tooltip } from "@/components/ui/tooltip";
import { MINUTOS_PAUSA, NOMBRE_DISPOSITIVO, duracion, etiquetaHora, rangoDeHoras, type Jornada } from "@/lib/rendimiento/jornada";
import { cargarFicha } from "./actions";
import { Flecha, hora } from "./piezas-ficha";
import { QueHizo } from "./que-hizo";

/** Lo que la lista necesita de cada persona: el detalle se pide al desplegar su ficha. */
export interface FilaEquipo {
  id: string;
  nombre: string;
  entrada: string | null;
  salida: string | null;
  minutosActivos: number;
  pausas: number;
  minutosPausa: number;
  acciones: number;
  principal: string | null;
  horas: { hora: number; minutos: number; acciones: number }[];
}

const otroDia = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fechaLarga = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const enlace = (dia: string, persona?: string | null, h?: number | null) => `/rendimiento?dia=${dia}${persona ? `&persona=${persona}` : ""}${persona && h != null ? `&hora=${h}` : ""}`;
const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{titulo}</h4>
      {children}
    </section>
  );
}

function Barra({ valor, total, color = "var(--primario)" }: { valor: number; total: number; color?: string }) {
  return (
    <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-muted">
      <span className="block h-full rounded-full" style={{ width: `${pct(valor, total)}%`, background: color }} />
    </span>
  );
}

/** En qué área estuvo y cuánto tiempo. Cada área se despliega en sus páginas. */
function PorArea({ j }: { j: Jornada }) {
  return (
    <ul className="m-0 grid list-none items-start gap-x-6 gap-y-2.5 p-0 sm:grid-cols-2">
      {j.areas.map((a) => (
        <li key={a.area}>
          <details className="group">
            <summary className={`flex cursor-pointer list-none flex-col gap-1 rounded [&::-webkit-details-marker]:hidden ${anilloFoco}`}>
              <span className="flex items-center gap-2 text-sm">
                <Flecha clase="group-open:rotate-90" />
                <span className="min-w-0 flex-1 truncate font-medium">{a.area}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {duracion(a.minutos)} · {pct(a.minutos, j.minutosActivos)} %
                </span>
              </span>
              <Barra valor={a.minutos} total={j.minutosActivos} />
            </summary>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 pl-6 text-[13px]">
              {a.paginas.map((p) => (
                <li key={p.pagina} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{p.pagina}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{duracion(p.minutos)}</span>
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** Desde dónde se conectó. Lo anotado antes de guardar el dispositivo sale como «Sin dato»: no se adivina. */
function PorDispositivo({ j }: { j: Jornada }) {
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {j.dispositivos.map((d) => (
          <li key={d.dispositivo ?? "sin-dato"} className="flex flex-col gap-1">
            <span className="flex justify-between gap-3 text-sm">
              <span className={d.dispositivo ? "font-medium" : "text-muted-foreground"}>{d.dispositivo ? NOMBRE_DISPOSITIVO[d.dispositivo] : "Sin dato"}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{duracion(d.minutos)}</span>
            </span>
            <Barra valor={d.minutos} total={j.minutosActivos} color={d.dispositivo ? undefined : "color-mix(in srgb, var(--muted-foreground) 45%, transparent)"} />
          </li>
        ))}
      </ul>
      {j.dispositivos.some((d) => !d.dispositivo) && <p className="m-0 text-xs text-muted-foreground">Sin dato: minutos anotados antes de empezar a guardar el dispositivo.</p>}
    </>
  );
}

/** La ficha ya cargada. */
export function ContenidoFicha({ nombre, dia, jornada: j, horaInicial }: { nombre: string; dia: string; jornada: Jornada; horaInicial: number | null }) {
  if (!j.entrada) return <p className="m-0 text-sm text-muted-foreground">{nombre} no tuvo actividad en el sistema este día.</p>;
  return (
    <div className="flex flex-col gap-4">
      <h3 className="m-0 text-base font-semibold">
        {nombre} <span className="font-normal text-muted-foreground">· {fechaLarga(dia)}</span>
      </h3>
      <KpiGrid compacta>
        <KpiCard compacta titulo="Entrada" valor={hora(j.entrada)} />
        <KpiCard compacta titulo="Salida" valor={hora(j.salida)} />
        <KpiCard compacta titulo="Tiempo activo" valor={duracion(j.minutosActivos)} />
        <KpiCard
          compacta
          titulo={`Pausas de más de ${MINUTOS_PAUSA} min`}
          valor={j.pausas.length ? duracion(j.pausas.reduce((t, x) => t + x.minutos, 0)) : "Ninguna"}
          subtexto={j.pausas.length ? `${j.pausas.length} ${j.pausas.length === 1 ? "pausa" : "pausas"}` : undefined}
        />
        <KpiCard compacta titulo="Acciones guardadas" valor={j.acciones.toLocaleString("es-PA")} />
        <KpiCard compacta titulo="WhatsApp desde el CRM" valor={j.mensajes.toLocaleString("es-PA")} />
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Tarjeta titulo="En qué área estuvo">
          <PorArea j={j} />
        </Tarjeta>
        <Tarjeta titulo="Desde dónde se conectó">
          <PorDispositivo j={j} />
        </Tarjeta>
      </div>
      <QueHizo j={j} horaInicial={horaInicial} />
    </div>
  );
}

/** Pide la ficha al desplegarse. Pulsar otra hora la monta de nuevo (`key`). */
function FichaPersona({ id, nombre, dia, horaInicial }: { id: string; nombre: string; dia: string; horaInicial: number | null }) {
  const [resultado, setResultado] = useState<{ jornada: Jornada } | { error: string } | null>(null);
  useEffect(() => {
    let vigente = true;
    cargarFicha(dia, id)
      .then((r) => vigente && setResultado(r))
      .catch(() => vigente && setResultado({ error: "No se pudo cargar la ficha." }));
    return () => {
      vigente = false;
    };
  }, [dia, id]);
  if (!resultado)
    return (
      <p role="status" className="m-0 animate-pulse text-sm text-muted-foreground motion-reduce:animate-none">
        Cargando la ficha de {nombre}…
      </p>
    );
  if ("error" in resultado)
    return (
      <p role="alert" className="m-0 text-sm text-destructive">
        {resultado.error}
      </p>
    );
  return <ContenidoFicha nombre={nombre} dia={dia} jornada={resultado.jornada} horaInicial={horaInicial} />;
}

/** Una barrita por hora (los minutos activos) en la fila de cada persona; pulsar una abre su ficha en esa hora. */
function TiraHoras({ persona, alPulsar }: { persona: FilaEquipo; alPulsar: (h: number) => void }) {
  const horas = new Map(persona.horas.map((h) => [h.hora, h]));
  return (
    <span className="flex h-7 items-end gap-px">
      {rangoDeHoras(persona.horas).map((h) => {
        const x = horas.get(h);
        const minutos = x?.minutos ?? 0;
        const acciones = x?.acciones ?? 0;
        const etiqueta = `${persona.nombre}, ${etiquetaHora(h)}: ${minutos} min${acciones ? `, ${acciones} acciones` : ""}`;
        return (
          <span key={h} className="flex h-full [&>span]:h-full">
            <Tooltip texto={etiqueta}>
              <button
                type="button"
                aria-label={etiqueta}
                onClick={(e) => {
                  e.stopPropagation();
                  alPulsar(h);
                }}
                className="flex h-full w-2 items-end rounded-sm hover:bg-muted"
              >
                <span
                  aria-hidden="true"
                  className={`block w-full rounded-t-[2px] ${minutos ? "bg-primario/70" : acciones ? "bg-primario/30" : "bg-border"}`}
                  style={{ height: minutos ? `${Math.max(12, (Math.min(60, minutos) / 60) * 100)}%` : acciones ? "20%" : "2px" }}
                />
              </button>
            </Tooltip>
          </span>
        );
      })}
    </span>
  );
}

const COLUMNAS = ["Persona", "Horas", "Entrada", "Salida", "Tiempo activo", "Pausas", "Acciones", "Más tiempo en"];

/** El equipo en un día. Pulsar a una persona despliega su ficha ahí mismo; la dirección de la página la recuerda, para compartirla o cambiar de día con ella abierta. */
export function PanelRendimiento({ equipo, dia, hoy, personaInicial, horaInicial }: { equipo: FilaEquipo[]; dia: string; hoy: string; personaInicial: string | null; horaInicial: number | null }) {
  const [abierta, setAbierta] = useState<{ id: string; hora: number | null } | null>(personaInicial ? { id: personaInicial, hora: horaInicial } : null);

  function mostrar(id: string | null, h: number | null = null) {
    setAbierta(id ? { id, hora: h } : null);
    window.history.replaceState(null, "", enlace(dia, id, h));
  }

  const con = equipo.filter((p) => p.entrada);
  const claseBoton = "rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted";
  return (
    <>
      <nav aria-label="Elegir el día" className="flex flex-wrap items-center gap-2">
        <Link href={enlace(otroDia(dia, -1), abierta?.id)} className={claseBoton}>
          ← Día anterior
        </Link>
        <form action="/rendimiento" className="flex items-center gap-2">
          {abierta && <input type="hidden" name="persona" value={abierta.id} />}
          <label className="flex items-center gap-2">
            <span className="sr-only">Día</span>
            <input type="date" name="dia" defaultValue={dia} max={hoy} className={`${fieldClass} w-auto`} />
          </label>
          <button type="submit" className={claseBoton}>
            Ver
          </button>
        </form>
        {dia < hoy && (
          <Link href={enlace(otroDia(dia, 1), abierta?.id)} className={claseBoton}>
            Día siguiente →
          </Link>
        )}
        {dia !== hoy && (
          <Link href={enlace(hoy, abierta?.id)} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            Hoy
          </Link>
        )}
        <span className="ml-auto text-sm text-muted-foreground first-letter:uppercase">{fechaLarga(dia)}</span>
      </nav>

      <section aria-labelledby="titulo-equipo" className="flex flex-col gap-4">
        <h2 id="titulo-equipo" className="text-base font-semibold">
          El equipo
        </h2>
        <KpiGrid compacta>
          <KpiCard compacta titulo="Personas que trabajaron" valor={`${con.length} de ${equipo.length}`} />
          <KpiCard compacta titulo="Tiempo activo del equipo" valor={duracion(con.reduce((t, p) => t + p.minutosActivos, 0))} />
          <KpiCard compacta titulo="Acciones guardadas" valor={con.reduce((t, p) => t + p.acciones, 0).toLocaleString("es-PA")} />
        </KpiGrid>
        <p className="m-0 text-sm text-muted-foreground">Pulsa una persona para ver su ficha: en qué área estuvo, cuánto tiempo, desde qué dispositivo y qué hizo.</p>
        <ContenedorTabla ariaLabel="Jornada de cada persona" encabezadoQuieto>
          <table className="tabla-datos w-full text-sm">
            <thead>
              <tr className={claseFilaEncabezado}>
                {COLUMNAS.map((t) => (
                  <th key={t} scope="col" className={claseEncabezadoColumna}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipo.map((p) => {
                const activa = abierta?.id === p.id;
                const alternar = () => mostrar(activa ? null : p.id);
                return (
                  <Fragment key={p.id}>
                    <tr onClick={alternar} className={`cursor-pointer border-b border-border last:border-0 ${activa ? "bg-accent" : "hover:bg-muted/50"} ${p.entrada ? "" : "text-muted-foreground"}`}>
                      <td className={claseCeldaColumna}>
                        <button
                          type="button"
                          aria-expanded={activa}
                          onClick={(e) => {
                            e.stopPropagation();
                            alternar();
                          }}
                          className={`flex items-center gap-1 rounded text-left font-medium text-foreground ${anilloFoco}`}
                        >
                          <Flecha abierta={activa} />
                          {p.nombre}
                        </button>
                      </td>
                      <td className={claseCeldaColumna}>
                        <TiraHoras persona={p} alPulsar={(h) => mostrar(p.id, h)} />
                      </td>
                      <td className={`${claseCeldaColumna} tabular-nums`}>{hora(p.entrada)}</td>
                      <td className={`${claseCeldaColumna} tabular-nums`}>{hora(p.salida)}</td>
                      <td className={`${claseCeldaColumna} tabular-nums`}>{p.entrada ? duracion(p.minutosActivos) : "Sin actividad"}</td>
                      <td className={`${claseCeldaColumna} tabular-nums`}>{p.pausas ? `${p.pausas} · ${duracion(p.minutosPausa)}` : "—"}</td>
                      <td className={`${claseCeldaColumna} tabular-nums`}>{p.acciones || "—"}</td>
                      <td className={claseCeldaColumna}>{p.principal ?? "—"}</td>
                    </tr>
                    {activa && (
                      <tr className="border-b border-border last:border-0">
                        <td colSpan={COLUMNAS.length} className="bg-muted/30 p-0 whitespace-normal">
                          <div className="sticky left-0 max-w-[calc(100vw-2rem)] p-4">
                            <FichaPersona key={`${p.id}-${abierta.hora}`} id={p.id} nombre={p.nombre} dia={dia} horaInicial={abierta.hora} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </ContenedorTabla>
      </section>
    </>
  );
}
