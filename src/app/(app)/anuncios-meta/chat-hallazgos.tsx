"use client";

import { useRef, useState, useTransition } from "react";
import { LIMITES_CHAT, type MensajeChat } from "@/lib/meta-ads/chat-ia";
import { preguntarHallazgosMeta } from "./actions";
import { SeccionPlegable } from "./plegable";

/** Preguntas para empezar: lo que más se quiere saber de un vistazo. */
const EJEMPLOS = [
  "¿Qué producto es el que mejor está funcionando?",
  "¿Cuál es el cambio más grande entre el mes pasado y este?",
  "¿Qué empeoró este mes frente al pasado y por qué?",
  "¿Qué productos venden bien pero entregan mal?",
  "¿Qué ángulos funcionan mejor en suplementos?",
];

interface Burbuja extends MensajeChat {
  /** Quién contestó (solo en las respuestas). */
  proveedor?: string;
  error?: boolean;
}

/**
 * Chat con las estadísticas (24 nov 2026, pedido de Alcides): se le pregunta a la IA cualquier cosa que se pueda responder con el historial, y ella contesta **solo con las estadísticas que el sistema ya calculó**
 * (hallazgos, tendencias, entrega, rankings, mes a mes). La conversación vive en la pantalla: no se guarda. Cada pregunta cuesta unos centavos de crédito de IA y hay un tope diario por persona.
 */
export function ChatHallazgos({ iaConectada }: { iaConectada: boolean }) {
  const [mensajes, setMensajes] = useState<Burbuja[]>([]);
  const [texto, setTexto] = useState("");
  const [quedan, setQuedan] = useState<number | null>(null);
  const [pensando, empezar] = useTransition();
  const fin = useRef<HTMLDivElement>(null);

  const enviar = (pregunta: string) => {
    const p = pregunta.replace(/\s+/g, " ").trim();
    if (p.length < 4 || pensando) return;
    const historial: MensajeChat[] = mensajes.filter((m) => !m.error).map(({ rol, texto: t }) => ({ rol, texto: t }));
    setMensajes((ms) => [...ms, { rol: "usuario", texto: p }]);
    setTexto("");
    empezar(async () => {
      const r = await preguntarHallazgosMeta(p, historial);
      setMensajes((ms) => [...ms, r.respuesta ? { rol: "ia", texto: r.respuesta, proveedor: r.proveedor } : { rol: "ia", texto: r.error ?? "No se pudo contestar. Inténtalo de nuevo.", error: true }]);
      if (r.quedan !== undefined) setQuedan(r.quedan);
      requestAnimationFrame(() => fin.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    });
  };

  return (
    <SeccionPlegable titulo="Pregúntale a los datos" resumen="Pregunta lo que quieras del historial" derecha={quedan !== null ? `${quedan} preguntas más hoy` : undefined}>
      {!iaConectada ? (
        <p className="m-0 text-sm text-muted-foreground">Falta conectar una IA de texto (OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel) para poder preguntar.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {mensajes.length === 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar />
                <p className="m-0 text-sm">
                  <span className="font-semibold">Pregunta lo que quieras del historial.</span> <span className="text-muted-foreground">Contesto solo con las estadísticas del sistema.</span>
                </p>
              </div>
              <ul role="list" aria-label="Preguntas de ejemplo" className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {EJEMPLOS.map((e) => (
                  <li key={e}>
                    <button type="button" onClick={() => enviar(e)} disabled={pensando} className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-medium hover:border-meta-1 hover:bg-meta-1/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-60">
                      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" className="shrink-0 text-meta-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8h10M9 4l4 4-4 4" />
                      </svg>
                      <span>{e}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul role="log" aria-live="polite" aria-label="Conversación" className="m-0 flex max-h-[28rem] list-none flex-col gap-3 overflow-y-auto p-0">
              {mensajes.map((m, i) => (
                <li key={i} className={`flex items-end gap-2 ${m.rol === "usuario" ? "flex-row-reverse" : ""}`}>
                  {m.rol === "ia" && <Avatar chico />}
                  <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${m.rol === "usuario" ? "rounded-br-sm bg-foreground text-background" : m.error ? "rounded-bl-sm border border-destructive/40 bg-destructive-soft text-destructive" : "rounded-bl-sm bg-muted"}`}>
                    {m.texto}
                    {m.proveedor && <span className="mt-1 block text-[11px] text-muted-foreground">{m.proveedor}</span>}
                  </div>
                </li>
              ))}
              {pensando && (
                <li className="flex items-end gap-2" role="status">
                  <Avatar chico />
                  <div className="rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
                    <span className="sr-only">Leyendo las estadísticas…</span>
                    <span aria-hidden="true" className="inline-flex gap-1">
                      {[0, 1, 2].map((n) => (
                        <span key={n} className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none" style={{ animationDelay: `${n * 150}ms` }} />
                      ))}
                    </span>
                  </div>
                </li>
              )}
              <div ref={fin} />
            </ul>
          )}
          <form
            className="flex items-end gap-2 rounded-xl border border-border-control bg-card p-2 focus-within:ring-2 focus-within:ring-foreground"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Tu pregunta</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  // Enter envía; Mayús + Enter baja de línea.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar(texto);
                  }
                }}
                rows={1}
                maxLength={LIMITES_CHAT.pregunta}
                placeholder="Por ejemplo: ¿qué ángulo funcionó mejor en el último mes?"
                className="block max-h-32 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
              />
            </label>
            {mensajes.length > 0 && (
              <button type="button" onClick={() => setMensajes([])} disabled={pensando} className="min-h-10 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                Nueva conversación
              </button>
            )}
            <button type="submit" disabled={pensando || texto.trim().length < 4} aria-label={pensando ? "Pensando" : "Preguntar"} className="flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-semibold text-background disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2">
              <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 8 13.5 2.5 9 13.5 7.5 9 2.5 8Z" />
              </svg>
              <span className="hidden sm:inline">{pensando ? "Pensando…" : "Preguntar"}</span>
            </button>
          </form>
        </div>
      )}
    </SeccionPlegable>
  );
}

/** La carita de la IA: un círculo con el color del módulo y una chispa. */
function Avatar({ chico = false }: { chico?: boolean }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-meta-1 text-white ${chico ? "h-7 w-7" : "h-9 w-9"}`}>
      <svg viewBox="0 0 16 16" width={chico ? 14 : 18} height={chico ? 14 : 18} fill="currentColor">
        <path d="M8 1.5 9.4 6 14 7.5 9.4 9 8 13.5 6.6 9 2 7.5 6.6 6 8 1.5Z" />
      </svg>
    </span>
  );
}
