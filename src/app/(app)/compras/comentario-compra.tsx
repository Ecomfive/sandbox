"use client";

import { useState, useTransition } from "react";
import { AvatarPersona } from "@/components/ui/avatar-persona";
import { CampoMenciones, TextoConMenciones } from "@/components/ui/campo-menciones";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { formatearFecha } from "@/lib/formato";
import { EMOJIS_REACCION } from "@/lib/compras/reacciones";
import { alternarReaccion, comentarCompra, type ActividadCompra, type ReaccionComentario } from "./actions";
import { archivosDe, BotonAdjuntar, GaleriaAdjuntos, TiraPendientes, useAdjuntosPendientes } from "./adjuntos-comentario";

type Comentario = ActividadCompra["comentarios"][number];

const fechaHora = (iso: string) =>
  `${formatearFecha(iso)} ${new Date(iso).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" })}`;

const claseAccion = `inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`;

/**
 * Un comentario de la actividad de una compra, como en ClickUp: iniciales, autor, hora, texto (con @menciones) y sus archivos;
 * debajo, las reacciones (👍 y emojis: cada persona pone o quita la suya), «Responder» y las respuestas, en un hilo de un solo
 * nivel. Una respuesta le avisa a quien escribió el comentario.
 */
export function TarjetaComentario({
  compraId,
  comentario,
  respuestas,
  resaltado,
  puedeComentar,
  alResponder,
}: {
  compraId: string;
  comentario: Comentario;
  respuestas: Comentario[];
  resaltado: string | null | undefined;
  puedeComentar: boolean;
  /** Después de responder: la actividad se vuelve a pedir. */
  alResponder: () => void;
}) {
  const [respondiendo, setRespondiendo] = useState(false);
  const enHilo = respuestas.some((r) => r.id === resaltado);
  return (
    <article
      id={`comentario-${comentario.id}`}
      ref={comentario.id === resaltado ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
      className={`my-1.5 flex flex-col gap-2 rounded-lg border p-3 text-sm ${comentario.id === resaltado ? "border-primario bg-primario-suave ring-2 ring-primario" : "border-border bg-card"}`}
    >
      <Cuerpo comentario={comentario} puedeComentar={puedeComentar} alResponder={() => setRespondiendo((v) => !v)} />
      {(respuestas.length > 0 || respondiendo) && (
        <div className="ml-4 flex flex-col gap-2 border-l-2 border-border pl-3">
          {respuestas.map((r) => (
            <div
              key={r.id}
              id={`comentario-${r.id}`}
              ref={r.id === resaltado && enHilo ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
              className={r.id === resaltado ? "-mx-1 rounded-md bg-primario-suave px-1 py-1 ring-2 ring-primario" : ""}
            >
              <Cuerpo comentario={r} puedeComentar={puedeComentar} pequeno alResponder={() => setRespondiendo(true)} />
            </div>
          ))}
          {respondiendo && puedeComentar && (
            <Respuesta
              compraId={compraId}
              respuestaA={comentario.id}
              alCancelar={() => setRespondiendo(false)}
              alEnviar={() => {
                setRespondiendo(false);
                alResponder();
              }}
            />
          )}
        </div>
      )}
    </article>
  );
}

/** Lo de un comentario (o una respuesta): autor, hora, texto, archivos, reacciones y «Responder». */
function Cuerpo({ comentario, puedeComentar, pequeno = false, alResponder }: { comentario: Comentario; puedeComentar: boolean; pequeno?: boolean; alResponder: () => void }) {
  return (
    <div className="flex gap-2.5">
      <AvatarPersona nombre={comentario.autor} email="?" avatarUrl={null} tamano="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-2">
          <strong className={`font-semibold ${pequeno ? "text-[13px]" : ""}`}>{comentario.autor ?? "—"}</strong>
          <time dateTime={comentario.creadoEn} className="text-xs text-muted-foreground">
            {fechaHora(comentario.creadoEn)}
          </time>
        </span>
        {comentario.texto && (
          <p className={`m-0 whitespace-pre-wrap break-words ${pequeno ? "text-[13px]" : ""} ${/^inconveniente/i.test(comentario.texto) ? "rounded-md bg-destructive/10 px-2 py-1 text-destructive" : ""}`}>
            <TextoConMenciones texto={comentario.texto} />
          </p>
        )}
        <GaleriaAdjuntos adjuntos={comentario.adjuntos} />
        <Reacciones comentarioId={comentario.id} iniciales={comentario.reacciones} puedeReaccionar={puedeComentar} alResponder={alResponder} />
      </div>
    </div>
  );
}

/** Las reacciones de un comentario (cada emoji con cuántas y de quiénes), «Me gusta», el selector de emojis y «Responder». */
function Reacciones({ comentarioId, iniciales, puedeReaccionar, alResponder }: { comentarioId: string; iniciales: ReaccionComentario[]; puedeReaccionar: boolean; alResponder: () => void }) {
  const { mostrarToast } = useToast();
  const [reacciones, setReacciones] = useState(iniciales);
  const [eligiendo, setEligiendo] = useState(false);
  const [pendiente, empezar] = useTransition();
  const megusta = reacciones.find((r) => r.emoji === "👍");

  function alternar(emoji: string) {
    setEligiendo(false);
    // Se ve al instante; si el servidor no la guarda, vuelve a como estaba.
    const antes = reacciones;
    setReacciones((lista) => {
      const g = lista.find((r) => r.emoji === emoji);
      if (!g) return [...lista, { emoji, n: 1, mia: true, nombres: ["Tú"] }];
      if (g.mia) return lista.map((r) => (r.emoji === emoji ? { ...r, n: r.n - 1, mia: false } : r)).filter((r) => r.n > 0);
      return lista.map((r) => (r.emoji === emoji ? { ...r, n: r.n + 1, mia: true, nombres: [...r.nombres, "Tú"] } : r));
    });
    empezar(async () => {
      const r = await alternarReaccion(comentarioId, emoji).catch(() => ({ error: "No se pudo guardar la reacción." }) as { error?: string; reacciones?: ReaccionComentario[] });
      if (r.error) {
        setReacciones(antes);
        mostrarToast(r.error, "destructive");
      } else if (r.reacciones) setReacciones(r.reacciones);
    });
  }

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1">
      {reacciones.map((r) => (
        <Tooltip key={r.emoji} texto={r.nombres.join(", ")}>
          <button
            type="button"
            disabled={!puedeReaccionar || pendiente}
            aria-pressed={r.mia}
            aria-label={`${r.emoji} ${r.n}: ${r.nombres.join(", ")}`}
            onClick={() => alternar(r.emoji)}
            className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums ${anilloFoco} ${r.mia ? "border-primario bg-primario-suave text-primario" : "border-border bg-card hover:bg-muted"}`}
          >
            <span aria-hidden="true">{r.emoji}</span>
            {r.n}
          </button>
        </Tooltip>
      ))}
      {puedeReaccionar && (
        <>
          {!megusta && (
            <button type="button" onClick={() => alternar("👍")} disabled={pendiente} className={claseAccion}>
              <span aria-hidden="true">👍</span> Me gusta
            </button>
          )}
          <span className="relative">
            <Tooltip texto="Reaccionar">
              <button type="button" aria-label="Reaccionar con un emoji" aria-expanded={eligiendo} onClick={() => setEligiendo((v) => !v)} className={claseAccion}>
                <span aria-hidden="true">😊</span>
                <span aria-hidden="true" className="text-[10px]">＋</span>
              </button>
            </Tooltip>
            {eligiendo && (
              <span role="group" aria-label="Elegir un emoji" className="absolute bottom-full left-0 z-10 mb-1 flex gap-0.5 rounded-full border border-border bg-card p-1 shadow-lg">
                {EMOJIS_REACCION.map((e) => (
                  <button key={e} type="button" aria-label={`Reaccionar con ${e}`} onClick={() => alternar(e)} className={`h-7 w-7 rounded-full text-base hover:bg-muted ${anilloFoco}`}>
                    {e}
                  </button>
                ))}
              </span>
            )}
          </span>
          <button type="button" onClick={alResponder} className={claseAccion}>
            Responder
          </button>
        </>
      )}
    </div>
  );
}

/** El campo para responder un comentario: texto con @menciones y archivos, como un comentario nuevo. */
function Respuesta({ compraId, respuestaA, alCancelar, alEnviar }: { compraId: string; respuestaA: string; alCancelar: () => void; alEnviar: () => void }) {
  const { mostrarToast } = useToast();
  const [texto, setTexto] = useState("");
  const [menciones, setMenciones] = useState<string[]>([]);
  const [pendiente, empezar] = useTransition();
  const adjuntos = useAdjuntosPendientes(compraId);

  function enviar() {
    empezar(async () => {
      const r = await comentarCompra(compraId, texto, menciones, adjuntos.listos, respuestaA).catch(() => ({ error: "No se pudo guardar la respuesta." }));
      if (r.error) return mostrarToast(r.error, "destructive");
      adjuntos.vaciar();
      alEnviar();
    });
  }

  return (
    <div
      onPaste={(e) => {
        const archivos = archivosDe(e);
        if (archivos.length === 0) return;
        e.preventDefault();
        adjuntos.agregar(archivos);
      }}
      className="flex flex-col gap-2"
    >
      <CampoMenciones ariaLabel="Respuesta" filas={2} valor={texto} alCambiar={setTexto} alMencionar={setMenciones} placeholder="Escribe tu respuesta… usa @ para etiquetar a alguien." />
      <TiraPendientes pendientes={adjuntos.pendientes} alQuitar={adjuntos.quitar} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pendiente || adjuntos.subiendo || (!texto.trim() && adjuntos.listos.length === 0)}
          onClick={enviar}
          className={`rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`}
        >
          {pendiente ? "Guardando…" : "Responder"}
        </button>
        <BotonAdjuntar alElegir={adjuntos.agregar} deshabilitado={pendiente || adjuntos.lleno} />
        <button type="button" onClick={alCancelar} className={`rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground ${anilloFoco}`}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
