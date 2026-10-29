"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { CampoMenciones } from "@/components/ui/campo-menciones";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { AccionesActividad, ComentarioActividad, DatosActividad, EventoActividad } from "@/lib/comentarios/tipos";
import { formatearFecha } from "@/lib/formato";
import { HistorialIcon } from "@/lib/nav-icons";
import { archivosDe, BotonAdjuntar, GaleriaAdjuntos, TiraPendientes, useAdjuntosPendientes } from "./adjuntos";
import { ProveedorAccionesActividad } from "./contexto";
import { TarjetaComentario } from "./tarjeta-comentario";

const corto = (t: string | null, max = 120) => (t && t.length > max ? `${t.slice(0, max)}…` : t);

export const fechaHora = (iso: string) =>
  `${formatearFecha(iso)} ${new Date(iso).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" })}`;

type Item =
  | { tipo: "comentario"; fecha: string; c: ComentarioActividad }
  | { tipo: "cambio"; fecha: string; e: EventoActividad }
  | { tipo: "archivo"; fecha: string; a: DatosActividad["adjuntos"][number] };

/** Un cambio sin dibujo propio: su línea ya armada (`texto`) o «Dato: antes → después». */
export function CambioTexto({ e }: { e: EventoActividad }) {
  if (e.texto) return <span className="break-words">{e.texto}</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground">{e.campo}:</span>
      {e.antes !== null && (
        <>
          <span className="break-words">{corto(e.antes)}</span>
          <span aria-label="pasó a" className="text-muted-foreground">
            →
          </span>
        </>
      )}
      <span className="break-words">{corto(e.despues) ?? "—"}</span>
    </span>
  );
}

/**
 * La actividad de un registro, al final de su ficha, como la de ClickUp (nació en Compras): **un solo bloque** con los
 * comentarios (tarjeta con iniciales, autor, hora, texto, archivos, respuestas y reacciones), los cambios (una línea corta en
 * gris: quién y qué cambió) y los archivos sueltos, en orden de tiempo y con el campo para comentar abajo. Se filtra por Todo,
 * Comentarios o Cambios. Cada módulo le da cómo leer su actividad (`obtener`), sus acciones (`acciones`: comentar, editar,
 * eliminar, reaccionar, subir archivos) y, si quiere, cómo dibujar un cambio (`renderCambio`) y algo arriba (`arriba`). Se pide al
 * abrir la ficha y otra vez cuando sube `version`.
 */
export function Actividad<T extends DatosActividad>({
  id,
  obtener,
  acciones,
  puedeComentar = true,
  comentarioResaltado,
  renderCambio = (e) => <CambioTexto e={e} />,
  iconoCambio,
  arriba,
  placeholder = "Escribe un comentario… usa @ para etiquetar a alguien.",
  version: versionFuera = 0,
}: {
  id: string;
  obtener: (id: string) => Promise<T | { error: string }>;
  acciones: AccionesActividad;
  puedeComentar?: boolean;
  comentarioResaltado?: string | null;
  renderCambio?: (e: EventoActividad) => ReactNode;
  /** El ícono de un cambio en lugar del punto gris (el de la acción: archivar, liquidación…); null deja el punto. */
  iconoCambio?: (e: EventoActividad) => ReactNode;
  arriba?: (datos: T) => ReactNode;
  placeholder?: string;
  /** Súbelo cuando algo de fuera cambió la actividad (una decisión, un cambio guardado) para volver a pedirla. */
  version?: number;
}) {
  return (
    <ProveedorAccionesActividad acciones={acciones}>
      <Feed id={id} obtener={obtener} acciones={acciones} puedeComentar={puedeComentar} comentarioResaltado={comentarioResaltado} renderCambio={renderCambio} iconoCambio={iconoCambio} arriba={arriba} placeholder={placeholder} versionFuera={versionFuera} />
    </ProveedorAccionesActividad>
  );
}

function Feed<T extends DatosActividad>({
  id,
  obtener,
  acciones,
  puedeComentar,
  comentarioResaltado,
  renderCambio,
  iconoCambio,
  arriba,
  placeholder,
  versionFuera,
}: {
  id: string;
  obtener: (id: string) => Promise<T | { error: string }>;
  acciones: AccionesActividad;
  puedeComentar: boolean;
  comentarioResaltado?: string | null;
  renderCambio: (e: EventoActividad) => ReactNode;
  iconoCambio?: (e: EventoActividad) => ReactNode;
  arriba?: (datos: T) => ReactNode;
  placeholder: string;
  versionFuera: number;
}) {
  const { mostrarToast } = useToast();
  const [datos, setDatos] = useState<T | "error" | null>(null);
  const [version, setVersion] = useState(0);
  const [texto, setTexto] = useState("");
  const [menciones, setMenciones] = useState<string[]>([]);
  // El campo se vuelve a armar (vacío) después de comentar.
  const [vueltaCampo, setVueltaCampo] = useState(0);
  const [pendiente, start] = useTransition();
  // Los archivos del comentario que se escribe (la captura de un pago…): suben al elegirlos y viajan con el comentario.
  const adjuntos = useAdjuntosPendientes(id);
  const [sobreCampo, setSobreCampo] = useState(false);
  const [filtro, setFiltro] = useState<"todo" | "comentarios" | "cambios">("todo");
  const [verTodo, setVerTodo] = useState(false);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vigente = true;
    obtener(id)
      .then((r) => vigente && setDatos("error" in r ? "error" : r))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [id, version, versionFuera, obtener]);

  function comentar() {
    start(async () => {
      const r = await acciones.comentar(id, texto, menciones, adjuntos.listos);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        if (menciones.length) mostrarToast(`Comentario guardado: se avisó a ${menciones.length} persona${menciones.length === 1 ? "" : "s"}`);
        setTexto("");
        setMenciones([]);
        adjuntos.vaciar();
        setVueltaCampo((v) => v + 1);
        setVersion((v) => v + 1);
      }
    });
  }

  // Una sola línea de tiempo, como la actividad de ClickUp: comentarios, cambios y archivos sueltos juntos, de lo más viejo
  // (arriba) a lo más nuevo (abajo, junto al campo para comentar). Lo viejo se pliega detrás de «Ver anteriores».
  const items: Item[] = useMemo(() => {
    if (!datos || datos === "error") return [];
    const todos: Item[] = [
      // Las respuestas no van sueltas: se ven dentro del comentario al que responden.
      ...datos.comentarios.filter((c) => !c.respuestaA).map((c) => ({ tipo: "comentario" as const, fecha: c.creadoEn, c })),
      ...datos.eventos.map((e) => ({ tipo: "cambio" as const, fecha: e.ocurridoEn, e })),
      ...datos.adjuntos.map((a) => ({ tipo: "archivo" as const, fecha: a.creadoEn, a })),
    ];
    return todos.sort((x, y) => x.fecha.localeCompare(y.fecha));
  }, [datos]);
  const nComentarios = items.filter((it) => it.tipo === "comentario").length;
  // Las respuestas de cada comentario, de la más vieja a la más nueva.
  const respuestas = useMemo(() => {
    const m = new Map<string, ComentarioActividad[]>();
    if (!datos || datos === "error") return m;
    for (const c of [...datos.comentarios].sort((x, y) => x.creadoEn.localeCompare(y.creadoEn)))
      if (c.respuestaA) m.set(c.respuestaA, [...(m.get(c.respuestaA) ?? []), c]);
    return m;
  }, [datos]);
  const filtrados = items.filter((it) => filtro === "todo" || (filtro === "comentarios" ? it.tipo === "comentario" : it.tipo !== "comentario"));
  // Se ven los últimos 30 (todo si hay un comentario que señalar); el resto con «Ver anteriores».
  const ocultos = verTodo || comentarioResaltado ? 0 : Math.max(0, filtrados.length - 30);
  const visibles = filtrados.slice(ocultos);
  // Al cargar o comentar, la lista baja hasta lo más nuevo (salvo que haya un comentario que señalar).
  useEffect(() => {
    if (comentarioResaltado) return;
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, filtro, comentarioResaltado]);

  if (datos === null) return <p className="px-5 pb-5 text-sm text-muted-foreground">Cargando la actividad…</p>;
  if (datos === "error")
    return (
      <p role="alert" className="px-5 pb-5 text-sm text-destructive">
        No se pudo cargar la actividad.
      </p>
    );

  return (
    <div className="flex flex-col gap-5 border-t border-border p-5">
      {arriba?.(datos)}

      <section aria-labelledby={`actividad-${id}`} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-3.5 py-2">
          <h3 id={`actividad-${id}`} className="m-0 flex items-center gap-1.5 text-sm font-semibold">
            <HistorialIcon className="h-4 w-4 text-muted-foreground" />
            Actividad
          </h3>
          <div role="group" aria-label="Qué ver en la actividad" className="flex gap-0.5 rounded-[7px] border border-border bg-card p-0.5">
            {(
              [
                ["todo", "Todo", items.length],
                ["comentarios", "Comentarios", nComentarios],
                ["cambios", "Cambios", items.length - nComentarios],
              ] as const
            ).map(([valor, etiqueta, n]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={filtro === valor}
                onClick={() => setFiltro(valor)}
                className={`rounded-[5px] px-2 py-0.5 text-xs ${anilloFoco} ${filtro === valor ? "bg-primario text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                {etiqueta} <span className="tabular-nums opacity-75">{n}</span>
              </button>
            ))}
          </div>
        </header>

        <div ref={lista} className="flex max-h-[34rem] min-h-24 flex-col gap-1 overflow-y-auto overscroll-contain px-3.5 py-3">
          {ocultos > 0 && (
            <button
              type="button"
              onClick={() => setVerTodo(true)}
              className={`mx-auto mb-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
            >
              Ver {ocultos} {ocultos === 1 ? "anterior" : "anteriores"}
            </button>
          )}
          {visibles.length === 0 && <p className="m-auto text-sm text-muted-foreground">{filtro === "comentarios" ? "Sin comentarios todavía." : "Sin actividad todavía."}</p>}
          {visibles.map((it) =>
            it.tipo === "comentario" ? (
              <TarjetaComentario
                key={`c-${it.c.id}`}
                entidadId={id}
                comentario={it.c}
                respuestas={respuestas.get(it.c.id) ?? []}
                resaltado={comentarioResaltado}
                puedeComentar={puedeComentar}
                alResponder={() => setVersion((v) => v + 1)}
              />
            ) : it.tipo === "archivo" ? (
              <div key={`a-${it.a.id}`} className="flex items-start gap-2 py-1 text-[13px]">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-control" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-muted-foreground">
                    <span>Adjuntó un archivo</span>
                    <time dateTime={it.a.creadoEn} className="text-xs">
                      {fechaHora(it.a.creadoEn)}
                    </time>
                  </span>
                  <GaleriaAdjuntos adjuntos={[it.a]} />
                </div>
              </div>
            ) : (
              <div key={`e-${it.e.id}`} className="flex items-start gap-2 py-1 text-[13px]">
                {iconoCambio?.(it.e) ?? <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-control" />}
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="font-medium text-foreground">{it.e.autor ?? (it.e.origen.startsWith("clickup") ? "ClickUp" : "Sistema")}</span>
                    {renderCambio(it.e)}
                  </span>
                  <time dateTime={it.e.ocurridoEn} className="text-xs whitespace-nowrap text-muted-foreground">
                    {fechaHora(it.e.ocurridoEn)}
                    {it.e.origen.startsWith("clickup") ? " · ClickUp" : ""}
                  </time>
                </div>
              </div>
            ),
          )}
        </div>

        {puedeComentar && (
          <div
            // Una imagen que se pega (Ctrl+V) o se suelta sobre el campo queda adjunta al comentario, como en ClickUp.
            onPaste={(e) => {
              const archivos = archivosDe(e);
              if (archivos.length === 0) return;
              e.preventDefault();
              adjuntos.agregar(archivos);
            }}
            onDragOver={(e) => {
              if (![...e.dataTransfer.types].includes("Files")) return;
              e.preventDefault();
              setSobreCampo(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobreCampo(false);
            }}
            onDrop={(e) => {
              setSobreCampo(false);
              const archivos = archivosDe(e);
              if (archivos.length === 0) return;
              e.preventDefault();
              adjuntos.agregar(archivos);
            }}
            className={`flex flex-col gap-2 border-t border-border bg-card p-3 ${sobreCampo ? "outline-2 -outline-offset-2 outline-primario" : ""}`}
          >
            <CampoMenciones
              key={vueltaCampo}
              ariaLabel="Nuevo comentario"
              filas={2}
              valor={texto}
              alCambiar={setTexto}
              alMencionar={setMenciones}
              placeholder={placeholder}
            />
            <TiraPendientes pendientes={adjuntos.pendientes} alQuitar={adjuntos.quitar} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <BotonAdjuntar alElegir={adjuntos.agregarDesdeBoton} deshabilitado={pendiente || adjuntos.lleno} />
              <button
                ref={adjuntos.botonEnvio}
                type="button"
                disabled={pendiente || adjuntos.subiendo || (!texto.trim() && adjuntos.listos.length === 0)}
                onClick={comentar}
                className={`w-fit rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`}
              >
                {pendiente ? "Guardando…" : adjuntos.subiendo ? "Subiendo…" : "Comentar"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
