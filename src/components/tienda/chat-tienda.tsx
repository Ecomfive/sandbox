"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  enviarPlantillaChat,
  enviarTextoChat,
  leerChatTienda,
  notaChat,
  pausarBotChat,
  plantillasChat,
  type DestinoChat,
  type EstadoChat,
} from "@/app/(app)/tienda-pedidos/chat-actions";
import {
  rellenarPlantilla,
  ventana24,
  type MensajeChat,
} from "@/lib/tienda/chat-tienda";
import type { PlantillaChat } from "@/lib/tienda/chat-tienda-datos";
import { ChatIcon } from "@/lib/nav-icons";

// El chat de WhatsApp de un cliente en el número de su tienda, por iComfly (13 nov 2026; prototipo «Chat de tiendas con iComfly» aprobado). Se usa en la ficha
// del pedido (sin apartado propio). Se vuelve a leer cada 8 segundos mientras está a la vista (iComfly no avisa de los mensajes nuevos).

const CADA_MS = 8_000;
const hora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("es-PA", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Panama",
      })
    : null;

function Burbuja({ m }: { m: MensajeChat }) {
  const lado =
    m.de === "cliente"
      ? "self-start bg-card"
      : m.de === "bot"
        ? "self-end bg-muted"
        : "self-end bg-primario-suave";
  const quien =
    m.de === "bot"
      ? "🤖 Bot de iComfly"
      : m.de === "equipo"
        ? (m.autor ?? "Equipo")
        : null;
  const media = m.mediaUrl && m.mediaTipo?.startsWith("image");
  return (
    <li
      className={`max-w-[85%] rounded-xl px-3 py-1.5 text-sm shadow-sm ${lado} ${m.tipo === "template" ? "border-l-[3px] border-primario" : ""}`}
    >
      {quien && (
        <span
          className={`block text-[10.5px] font-semibold ${m.de === "bot" ? "text-muted-foreground" : "text-primario"}`}
        >
          {m.tipo === "template" ? `📋 Plantilla · ${quien}` : quien}
        </span>
      )}
      {media && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.mediaUrl!}
          alt="Imagen del chat"
          className="mb-1 max-h-56 rounded-lg object-contain"
          loading="lazy"
        />
      )}
      {m.mediaUrl && !media && (
        <a
          href={m.mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-xs font-medium text-primario underline"
        >
          {m.mediaTipo === "audio"
            ? "🎤 Audio"
            : m.mediaTipo === "video"
              ? "🎬 Video"
              : "📎 Archivo"}
        </a>
      )}
      {m.texto && (
        <p className="m-0 break-words whitespace-pre-wrap">{m.texto}</p>
      )}
      {m.transcripcion && (
        <p className="m-0 mt-1 text-xs text-muted-foreground italic">
          «{m.transcripcion}»
        </p>
      )}
      <span className="mt-0.5 block text-right text-[10px] text-muted-foreground tabular-nums">
        {hora(m.vistoEn) ?? ""}
        {m.de !== "cliente" && m.estado
          ? ` · ${m.estado === "read" ? "✓✓ leído" : m.estado === "delivered" ? "✓✓" : m.estado === "failed" ? "⚠ no salió" : "✓"}`
          : ""}
      </span>
    </li>
  );
}

function ElegirPlantilla({
  destino,
  nombreCliente,
  alEnviar,
  alCerrar,
}: {
  destino: DestinoChat;
  nombreCliente: string | null;
  alEnviar: () => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [lista, setLista] = useState<PlantillaChat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<PlantillaChat | null>(null);
  const [valores, setValores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    plantillasChat(destino).then((r) =>
      "error" in r ? setError(r.error) : setLista(r.plantillas),
    );
  }, [destino]);
  const elegir = (p: PlantillaChat) => {
    setElegida(p);
    setValores(
      p.etiquetas.map((e) =>
        /name|nombre/i.test(e) && nombreCliente
          ? nombreCliente.split(/\s+/)[0]
          : "",
      ),
    );
  };
  if (error)
    return (
      <p className="m-0 rounded-lg bg-destructive-soft px-3 py-2 text-xs text-destructive">
        {error}
      </p>
    );
  if (!lista)
    return (
      <p className="m-0 px-1 text-xs text-muted-foreground">
        Cargando plantillas…
      </p>
    );
  if (!elegida)
    return (
      <div className="flex max-h-56 flex-col overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-md">
        {lista.length === 0 && (
          <p className="m-0 p-2 text-xs text-muted-foreground">
            La tienda no tiene plantillas aprobadas.
          </p>
        )}
        {lista.map((p) => (
          <button
            key={`${p.nombre}-${p.idioma}`}
            type="button"
            onClick={() => elegir(p)}
            className={`rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted ${anilloFoco}`}
          >
            <b className="block">📋 {p.nombre}</b>
            <span className="line-clamp-2 text-muted-foreground">
              {p.cuerpo}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={alCerrar}
          className="mt-1 rounded px-2 py-1 text-left text-xs text-muted-foreground hover:underline"
        >
          Cerrar
        </button>
      </div>
    );
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2 shadow-md"
      onSubmit={async (e) => {
        e.preventDefault();
        setEnviando(true);
        const r = await enviarPlantillaChat(destino, {
          nombre: elegida.nombre,
          idioma: elegida.idioma,
          valores,
        });
        setEnviando(false);
        if (r.error) return mostrarToast(r.error, "destructive");
        mostrarToast("Plantilla enviada.");
        alEnviar();
      }}
    >
      <b className="text-xs">📋 {elegida.nombre}</b>
      {elegida.variables.map((n, i) => (
        <label
          key={n}
          className="flex flex-col gap-0.5 text-[11px] text-muted-foreground"
        >
          {`{{${n}}}`} · {elegida.etiquetas[i]}
          <input
            value={valores[i] ?? ""}
            onChange={(e) =>
              setValores((v) => v.map((x, j) => (j === i ? e.target.value : x)))
            }
            className={`h-8 rounded-md border border-border-control bg-card px-2 text-xs text-foreground ${anilloFoco}`}
            required
          />
        </label>
      ))}
      <p className="m-0 rounded-md bg-muted px-2 py-1.5 text-xs whitespace-pre-wrap">
        {rellenarPlantilla(elegida.cuerpo, valores)}
      </p>
      <span className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setElegida(null)}
          className={`rounded-md border border-border-control px-2.5 py-1 text-xs ${anilloFoco}`}
        >
          Otra
        </button>
        <button
          type="submit"
          disabled={enviando}
          className={`rounded-md border border-foreground bg-foreground px-2.5 py-1 text-xs font-medium text-background disabled:opacity-60 ${anilloFoco}`}
        >
          {enviando ? "Enviando…" : "Enviar plantilla"}
        </button>
      </span>
    </form>
  );
}

export function ChatTienda({
  destino,
  nombreCliente = null,
  respaldo,
  puedeEscribir,
}: {
  destino: DestinoChat;
  nombreCliente?: string | null;
  respaldo?: ReactNode;
  puedeEscribir: boolean;
}) {
  const { mostrarToast } = useToast();
  const [chat, setChat] = useState<EstadoChat | null>(null);
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState(false);
  const [plantillas, setPlantillas] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  // «Ahora» se toma al leer (no al dibujar), para la ventana de 24 horas.
  const [ahora, setAhora] = useState(() => Date.now());
  const lista = useRef<HTMLOListElement>(null);
  const ultimo = useRef<number | null>(null);
  // Hasta qué mensaje quedó marcado leído en iComfly (así no se marca en cada lectura, solo cuando llega uno nuevo).
  const leidoHasta = useRef<number | null>(null);
  const clave = JSON.stringify(destino);

  const leer = useCallback(async () => {
    const r = await leerChatTienda(
      JSON.parse(clave) as DestinoChat,
      leidoHasta.current,
    ).catch(() => null);
    setAhora(Date.now());
    if (r) {
      if (r.leidoHasta !== undefined) leidoHasta.current = r.leidoHasta;
      setChat(r);
    }
  }, [clave]);

  // Otro destino monta otro chat (la bandeja le pone `key`), así que aquí solo se lee y se repite.
  useEffect(() => {
    const primera = setTimeout(() => void leer(), 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void leer();
    }, CADA_MS);
    return () => {
      clearTimeout(primera);
      clearInterval(t);
    };
  }, [leer]);

  // Baja al último mensaje cuando llega uno nuevo.
  useEffect(() => {
    const id = chat?.mensajes.at(-1)?.id ?? null;
    if (id !== null && id !== ultimo.current) {
      ultimo.current = id;
      lista.current?.scrollTo({ top: lista.current.scrollHeight });
    }
  }, [chat]);

  if (!chat)
    return (
      <div className="flex h-full min-h-0 flex-col">
        <p className="m-0 flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          Cargando el chat…
        </p>
      </div>
    );
  if (chat.estado === "sin_conexion" && respaldo) return <>{respaldo}</>;
  if (chat.estado !== "ok")
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
        <ChatIcon className="h-5 w-5" aria-hidden="true" />
        {chat.estado === "sin_conexion"
          ? `${chat.tiendaNombre ?? "La tienda"} no está conectada a iComfly (Tiendas Shopify › WhatsApp).`
          : chat.estado === "sin_telefono"
            ? "El pedido no tiene un teléfono válido para buscar su chat."
            : (chat.error ?? "No se pudo leer el chat.")}
      </div>
    );

  const ventana = ventana24(chat.mensajes, ahora);
  const escribir = puedeEscribir && chat.puedeEnviar;
  async function enviar() {
    const t = texto.trim();
    if (!t || ocupado) return;
    setOcupado(true);
    const r = nota
      ? await notaChat(destino, t)
      : await enviarTextoChat(destino, t);
    setOcupado(false);
    if (r.error) {
      mostrarToast(r.error, "destructive");
      if ("necesitaPlantilla" in r && r.necesitaPlantilla) setPlantillas(true);
      return;
    }
    setTexto("");
    mostrarToast(
      nota
        ? "Nota guardada en iComfly (el cliente no la ve)."
        : "Mensaje enviado.",
    );
    setNota(false);
    void leer();
  }
  async function cambiarBot() {
    if (!chat) return;
    setOcupado(true);
    const r = await pausarBotChat(destino, !chat.botPausado);
    setOcupado(false);
    if (r.error) return mostrarToast(r.error, "destructive");
    void leer();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <span
              aria-hidden="true"
              className="grid h-5 w-5 place-items-center rounded-full bg-success text-[10px] font-bold text-white"
            >
              ✆
            </span>
            WhatsApp · {chat.tiendaNombre}
          </span>
          <span className="text-[11px] text-muted-foreground">vía iComfly</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={!chat.botPausado}
              aria-label="Bot de iComfly en este chat"
              disabled={!escribir || ocupado || chat.conversacionId === null}
              onClick={cambiarBot}
              className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${chat.botPausado ? "bg-border-control" : "bg-success"} ${anilloFoco}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${chat.botPausado ? "left-0.5" : "left-[18px]"}`}
              />
            </button>
            {chat.botPausado
              ? `Bot en pausa${chat.pausadoPor ? ` · lo atiende ${chat.pausadoPor}` : ""}`
              : "Bot respondiendo"}
          </span>
        </div>
      </div>

      {chat.mensajes.length === 0 ? (
        <p className="m-0 flex flex-1 items-center justify-center bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
          El cliente todavía no tiene chat con el número de la tienda.
        </p>
      ) : (
        <ol
          ref={lista}
          className="m-0 flex min-h-0 flex-1 list-none flex-col gap-1.5 overflow-y-auto bg-muted/30 p-3"
          aria-live="polite"
        >
          {chat.mensajes.map((m) => (
            <Burbuja key={m.id} m={m} />
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-1.5 border-t border-border p-2">
        <p className="m-0 flex justify-between gap-2 text-[11px] text-muted-foreground">
          {ventana === "abierta" ? (
            <span>
              <b className="text-success">● Ventana abierta</b> · el cliente
              escribió hace menos de 24 h
            </span>
          ) : ventana === "cerrada" ? (
            <span>
              <b className="text-warning">● Fuera de las 24 h</b> · solo se
              puede mandar una plantilla
            </span>
          ) : (
            <span>
              Si pasaron más de 24 h desde el último mensaje del cliente,
              WhatsApp solo deja mandar una plantilla.
            </span>
          )}
          {nota && <b className="text-warning">Nota interna</b>}
        </p>
        {plantillas && escribir && (
          <ElegirPlantilla
            destino={destino}
            nombreCliente={nombreCliente}
            alCerrar={() => setPlantillas(false)}
            alEnviar={() => {
              setPlantillas(false);
              void leer();
            }}
          />
        )}
        {escribir ? (
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              title="Plantillas"
              aria-label="Plantillas"
              onClick={() => setPlantillas((v) => !v)}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted ${anilloFoco}`}
            >
              📋
            </button>
            <button
              type="button"
              title="Nota interna (el cliente no la ve)"
              aria-label="Nota interna"
              aria-pressed={nota}
              onClick={() => setNota((v) => !v)}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${nota ? "bg-warning-soft" : "hover:bg-muted"} ${anilloFoco}`}
            >
              📝
            </button>
            <textarea
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              disabled={ventana === "cerrada" && !nota}
              placeholder={
                nota
                  ? "Nota para el equipo…"
                  : ventana === "cerrada"
                    ? "Fuera de las 24 h: elige una plantilla 📋"
                    : "Escribe un mensaje…"
              }
              aria-label={nota ? "Nota interna" : "Mensaje"}
              className={`max-h-32 min-h-9 flex-1 resize-none rounded-2xl border border-border-control bg-card px-3 py-2 text-sm disabled:opacity-60 ${anilloFoco}`}
            />
            <button
              type="button"
              aria-label={nota ? "Guardar nota" : "Enviar"}
              disabled={ocupado || !texto.trim()}
              onClick={() => void enviar()}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success text-white disabled:opacity-50 ${anilloFoco}`}
            >
              ➤
            </button>
          </div>
        ) : (
          <p className="m-0 text-[11px] text-muted-foreground">
            {puedeEscribir
              ? "El pedido no tiene un teléfono válido para escribirle."
              : "Solo lectura: tu rol no puede escribir en los chats."}
          </p>
        )}
        {escribir && (
          <p className="m-0 text-[10.5px] text-muted-foreground">
            Al escribir tú, el bot se pausa en este chat.
          </p>
        )}
      </div>
    </div>
  );
}
