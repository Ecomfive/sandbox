"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { InteligenciaIcon } from "@/lib/nav-icons";

// «Pregúntale al sistema» (14 nov 2026, pedido de Hernán): el chat con el asistente del sistema (`/api/asistente`). La conversación vive aquí, en el
// navegador (no se guarda); la respuesta llega a medida que se escribe. El asistente solo consulta, con los permisos de quien pregunta.

interface Mensaje {
  rol: "usuario" | "asistente";
  texto: string;
  error?: boolean;
}

const EJEMPLOS = ["¿Cómo hago una remisión a una bodega externa?", "¿Cuánto stock hay del Aceite Corporal Magic?", "¿En qué va el pedido 1257?", "¿Qué significa B81?"];

/** Negrita y enlaces de una línea. Un enlace solo se vuelve enlace si va a una pantalla del sistema («/…»): nada de afuera. */
function enLinea(t: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/[^)\s]*)\)|\*\*([^*]+)\*\*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m.index > ultimo) partes.push(t.slice(ultimo, m.index));
    if (m[1])
      partes.push(
        <Link key={m.index} href={m[2]} className="font-medium text-primario underline-offset-2 hover:underline">
          {m[1]}
        </Link>,
      );
    else partes.push(<strong key={m.index}>{m[3]}</strong>);
    ultimo = re.lastIndex;
  }
  if (ultimo < t.length) partes.push(t.slice(ultimo));
  return partes;
}

/** El texto de la respuesta: párrafos, listas con «-» o «1.» y títulos «#», sin HTML. */
function TextoRespuesta({ texto }: { texto: string }) {
  const bloques: ReactNode[] = [];
  let lista: { tipo: "ul" | "ol"; items: string[] } | null = null;
  const cerrar = () => {
    if (!lista) return;
    const { tipo, items } = lista;
    const Tag = tipo;
    bloques.push(
      <Tag key={`l${bloques.length}`} className={`m-0 flex flex-col gap-0.5 pl-5 ${tipo === "ul" ? "list-disc" : "list-decimal"}`}>
        {items.map((x, i) => (
          <li key={i}>{enLinea(x)}</li>
        ))}
      </Tag>,
    );
    lista = null;
  };
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    const punto = l.match(/^[-*•]\s+(.*)$/);
    const paso = l.match(/^\d+[.)]\s+(.*)$/);
    if (punto || paso) {
      const tipo = punto ? "ul" : "ol";
      if (lista && lista.tipo !== tipo) cerrar();
      lista ??= { tipo, items: [] };
      lista.items.push((punto ?? paso)![1]);
      continue;
    }
    cerrar();
    if (!l) continue;
    const titulo = l.match(/^#{1,4}\s+(.*)$/);
    bloques.push(
      titulo ? (
        <p key={`h${bloques.length}`} className="m-0 font-semibold">
          {enLinea(titulo[1])}
        </p>
      ) : (
        <p key={`p${bloques.length}`} className="m-0">
          {enLinea(l)}
        </p>
      ),
    );
  }
  cerrar();
  return <div className="flex flex-col gap-1.5">{bloques}</div>;
}

export function AsistenteChat({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes, estado]);

  async function preguntar(pregunta: string) {
    const q = pregunta.trim();
    if (!q || ocupado) return;
    // Lo que se manda: sin las respuestas con error, y la conversación empieza siempre por una pregunta.
    const previos = mensajes.filter((m) => !m.error && m.texto);
    const historia: Mensaje[] = [...previos, { rol: "usuario" as const, texto: q }].slice(-19);
    while (historia.length && historia[0].rol !== "usuario") historia.shift();
    setMensajes([...mensajes, { rol: "usuario" as const, texto: q }, { rol: "asistente" as const, texto: "" }]);
    setTexto("");
    setOcupado(true);
    setEstado("Pensando…");
    const ponerRespuesta = (cambiar: (m: Mensaje) => Mensaje) => setMensajes((ms) => [...ms.slice(0, -1), cambiar(ms[ms.length - 1])]);
    try {
      const r = await fetch("/api/asistente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensajes: historia.map(({ rol, texto }) => ({ rol, texto })) }) });
      if (!r.ok || !r.body) {
        const e = await r.json().catch(() => null);
        throw new Error((e as { error?: string } | null)?.error ?? "No se pudo preguntar.");
      }
      const lector = r.body.getReader();
      const dec = new TextDecoder();
      let resto = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";
        for (const linea of lineas) {
          if (!linea.trim()) continue;
          const ev = JSON.parse(linea) as { t: string; d?: string };
          if (ev.t === "texto" && ev.d) {
            setEstado(null);
            ponerRespuesta((m) => ({ ...m, texto: m.texto + ev.d }));
          } else if (ev.t === "herramienta" && ev.d) setEstado(ev.d);
          else if (ev.t === "error") ponerRespuesta((m) => ({ ...m, texto: `${m.texto}${m.texto ? "\n\n" : ""}${ev.d ?? "No se pudo responder."}`, error: true }));
        }
      }
    } catch (e) {
      ponerRespuesta((m) => ({ ...m, texto: e instanceof Error ? e.message : "No se pudo preguntar.", error: true }));
    } finally {
      setOcupado(false);
      setEstado(null);
    }
  }

  return (
    <Ventana
      abierto={abierto}
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        <span className="flex items-center gap-2">
          <InteligenciaIcon className="h-4 w-4 text-primario" aria-hidden="true" />
          Pregúntale al sistema
        </span>
      }
      navegacion={
        mensajes.length > 0 ? (
          <button type="button" onClick={() => !ocupado && setMensajes([])} className={`rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted ${anilloFoco}`}>
            Nueva conversación
          </button>
        ) : undefined
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-[18rem] flex-1 flex-col gap-3 overflow-y-auto p-4">
          {mensajes.length === 0 && (
            <div className="flex flex-col gap-3 text-sm">
              <p className="m-0 text-muted-foreground">
                Pregunta cómo se hace algo en el sistema, qué significa un término, o datos como el stock de un producto, sus compras o en qué va un pedido de tienda. Solo consulta: no cambia nada, y ve lo mismo que tú puedes
                abrir.
              </p>
              <div className="flex flex-col gap-1.5">
                {EJEMPLOS.map((e) => (
                  <button key={e} type="button" onClick={() => preguntar(e)} className={`rounded-lg border border-border px-3 py-2 text-left text-[13px] hover:border-primario hover:bg-primario-suave ${anilloFoco}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mensajes.map((m, i) =>
            m.rol === "usuario" ? (
              <p key={i} className="m-0 max-w-[85%] self-end rounded-xl bg-primario-suave px-3 py-2 text-sm whitespace-pre-wrap">
                {m.texto}
              </p>
            ) : (
              <div key={i} className={`max-w-[95%] self-start rounded-xl border px-3 py-2 text-sm leading-relaxed ${m.error ? "border-destructive/40 text-destructive" : "border-border bg-card"}`}>
                {m.texto ? <TextoRespuesta texto={m.texto} /> : <span className="text-muted-foreground">…</span>}
              </div>
            ),
          )}
          {estado && (
            <p role="status" className="m-0 animate-pulse text-xs text-muted-foreground">
              {estado}
            </p>
          )}
          <div ref={finRef} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            preguntar(texto);
          }}
          className="sticky bottom-0 flex items-end gap-2 border-t border-border bg-card p-3"
        >
          <textarea
            data-enfocar
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                preguntar(texto);
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Escribe tu pregunta…"
            aria-label="Tu pregunta"
            className={`${fieldClass} min-h-[2.75rem] flex-1 resize-none`}
          />
          <button type="submit" disabled={ocupado || !texto.trim()} className={`boton-neon rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${anilloFoco}`}>
            {ocupado ? "…" : "Preguntar"}
          </button>
        </form>
        <p className="m-0 px-3 pb-2 text-[11px] text-muted-foreground">Responde con IA: revisa lo importante en su pantalla. La conversación no se guarda.</p>
      </div>
    </Ventana>
  );
}
