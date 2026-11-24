"use client";

import { useRef, useState, useTransition } from "react";
import { LIMITES_CHAT, type MensajeChat } from "@/lib/meta-ads/chat-ia";
import { preguntarHallazgosMeta } from "./actions";
import { TarjetaMeta } from "./graficas";

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
    <TarjetaMeta titulo="Pregúntale a los datos" id="chat" derecha={quedan !== null ? `${quedan} preguntas más hoy` : undefined}>
      {!iaConectada ? (
        <p className="m-0 text-sm text-muted-foreground">Falta conectar una IA de texto (OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel) para poder preguntar.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-xs text-muted-foreground">
            Pregunta lo que quieras del historial: la IA contesta solo con las estadísticas del sistema (no inventa cifras) y te dice si el dato no está. Cada pregunta cuesta unos centavos de crédito de IA.
          </p>
          {mensajes.length === 0 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preguntas de ejemplo">
              {EJEMPLOS.map((e) => (
                <button key={e} type="button" onClick={() => enviar(e)} disabled={pensando} className="min-h-8 rounded-md border border-border-control bg-card px-2.5 py-1 text-left text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-60">
                  {e}
                </button>
              ))}
            </div>
          ) : (
            <ul role="log" aria-live="polite" aria-label="Conversación" className="m-0 flex max-h-[28rem] list-none flex-col gap-2 overflow-y-auto p-0">
              {mensajes.map((m, i) => (
                <li key={i} className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${m.rol === "usuario" ? "self-end bg-foreground text-background" : m.error ? "self-start border border-destructive/40 bg-card text-destructive" : "self-start border border-border bg-card"}`}>
                  {m.texto}
                  {m.proveedor && <span className="mt-1 block text-xs text-muted-foreground">Contestó {m.proveedor} con las estadísticas del sistema</span>}
                </li>
              ))}
              {pensando && (
                <li className="self-start rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground" role="status">
                  Leyendo las estadísticas…
                </li>
              )}
              <div ref={fin} />
            </ul>
          )}
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
          >
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
              Tu pregunta
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
                rows={2}
                maxLength={LIMITES_CHAT.pregunta}
                placeholder="Por ejemplo: ¿qué ángulo funcionó mejor en el último mes?"
                className="w-full resize-y rounded-md border border-border-control bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
              />
            </label>
            <button type="submit" disabled={pensando || texto.trim().length < 4} className="min-h-10 rounded-md bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2">
              {pensando ? "Pensando…" : "Preguntar"}
            </button>
            {mensajes.length > 0 && (
              <button type="button" onClick={() => setMensajes([])} disabled={pensando} className="min-h-10 rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                Nueva conversación
              </button>
            )}
          </form>
        </div>
      )}
    </TarjetaMeta>
  );
}
