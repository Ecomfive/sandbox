"use client";

/* eslint-disable @next/next/no-img-element -- fotos que llegan por WhatsApp, servidas por /api/whatsapp/media */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { textoVentana } from "@/lib/whatsapp/ventana";
import type { AreaCrm } from "@/lib/crm/areas";
import { abrirConversacion, cambiarEstadoConversacion, conectarWebhook360, enviarWhatsapp, notaWhatsapp, obtenerBandeja, pasarConversacionDeArea, tomarConversacion } from "./actions";
import type { ConversacionVista, MensajeVista, NumeroVista, ResumenDropshipper } from "./datos-bandeja";

type Pestana = "sinResponder" | "mias" | "todas";
const REFRESCO_MS = 8000;

/** Las áreas de un chat, con el color de su etiqueta (boceto https://claude.ai/artifact/Sn3pB4cdUixXk6WdRh4kr8). */
const AREAS_CHAT: { valor: AreaCrm; etiqueta: string; clase: string }[] = [
  { valor: "atencion", etiqueta: "Atención", clase: "bg-azul-soft text-azul" },
  { valor: "comercial", etiqueta: "Comercial", clase: "bg-success-soft text-success" },
  { valor: "direccion", etiqueta: "Dirección", clase: "bg-primario-suave text-primario" },
];
const areaChat = (a: AreaCrm) => AREAS_CHAT.find((x) => x.valor === a) ?? AREAS_CHAT[0];

const iniciales = (nombre: string) =>
  nombre
    .replace(/^\+/, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const sinResponder = (c: ConversacionVista) => c.estado === "abierta" && (c.noLeidos > 0 || c.ultimoDe === "entrante");

/** «14:05» si es de hoy, «ayer», «26 oct». */
function horaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" });
  const ayer = new Date(hoy.getTime() - 86_400_000);
  if (d.toDateString() === ayer.toDateString()) return "ayer";
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short" });
}

const horaMensaje = (iso: string) => {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? hora : `${d.toLocaleDateString("es-PA", { day: "numeric", month: "short" })} ${hora}`;
};

const ESTADO_SALIENTE: Record<string, string> = { enviando: "Enviando", enviado: "Enviado", entregado: "Entregado", leido: "Leído", fallido: "No se entregó" };

/** El contenido de un mensaje: su texto y, si trae un archivo, la foto, el audio, el video o el enlace para bajarlo. */
function Contenido({ m }: { m: MensajeVista }) {
  const src = `/api/whatsapp/media/${m.id}`;
  return (
    <>
      {m.conArchivo && m.tipo === "imagen" && (
        <a href={src} target="_blank" rel="noreferrer" className={`block ${anilloFoco}`}>
          <img src={src} alt={m.texto ? `Foto: ${m.texto}` : "Foto que mandó por WhatsApp"} loading="lazy" className="max-h-64 max-w-full rounded-md object-contain" />
        </a>
      )}
      {m.conArchivo && m.tipo === "sticker" && <img src={src} alt="Sticker" loading="lazy" className="h-28 w-28 object-contain" />}
      {m.conArchivo && m.tipo === "audio" && <audio controls preload="none" src={src} className="max-w-full" />}
      {m.conArchivo && m.tipo === "video" && <video controls preload="none" src={src} className="max-h-64 max-w-full rounded-md" />}
      {m.conArchivo && m.tipo === "documento" && (
        <a href={src} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 font-medium text-primario underline-offset-2 hover:underline ${anilloFoco}`}>
          Abrir documento{m.mediaNombre ? `: ${m.mediaNombre}` : ""}
        </a>
      )}
      {m.tipo === "reaccion" && <span className="text-muted-foreground">Reaccionó </span>}
      {m.tipo === "ubicacion" && <span className="block text-xs font-medium text-muted-foreground">Ubicación</span>}
      {m.texto ? <span className="block whitespace-pre-wrap break-words">{m.texto}</span> : !m.conArchivo && m.tipo !== "reaccion" && <span className="text-muted-foreground">Mensaje que el sistema todavía no muestra ({m.tipo}).</span>}
    </>
  );
}

/**
 * La bandeja de WhatsApp (26 oct 2026): a la izquierda las conversaciones (Sin responder, Mías, Todas; por número), al centro el chat
 * para contestar o dejar una nota privada, y a la derecha el dropshipper. Se refresca sola cada pocos segundos mientras está a la vista.
 */
export function Bandeja({
  inicial,
  abrirInicial,
  escribe,
  miId,
  areas,
  estado360 = null,
}: {
  inicial: { numeros: NumeroVista[]; conversaciones: ConversacionVista[] };
  abrirInicial: string | null;
  escribe: boolean;
  miId: string;
  /** Las áreas que ve la persona: con más de una, cada chat muestra la suya. */
  areas: AreaCrm[];
  /** Solo para quien administra: qué datos de 360dialog tiene el servidor (si están, no su valor). Con la clave, puede registrar el webhook. */
  estado360?: { clave: boolean; sandbox: boolean; palabraSecreta: boolean } | null;
}) {
  const { mostrarToast } = useToast();
  const [datos, setDatos] = useState(inicial);
  const [pestana, setPestana] = useState<Pestana>(abrirInicial ? "todas" : "sinResponder");
  const [numero, setNumero] = useState<string>("todos");
  const [buscar, setBuscar] = useState("");
  const [elegido, setElegido] = useState<string | null>(abrirInicial);
  const [chat, setChat] = useState<{ id: string; mensajes: MensajeVista[]; dropshipper: ResumenDropshipper | null } | null>(null);
  const [modo, setModo] = useState<"responder" | "nota">("responder");
  const [borrador, setBorrador] = useState("");
  const [enviando, empezar] = useTransition();
  const finRef = useRef<HTMLDivElement>(null);

  const refrescar = useCallback(async (id: string | null) => {
    const b = await obtenerBandeja().catch(() => null);
    if (b && !("error" in b)) setDatos(b);
    if (id) {
      const c = await abrirConversacion(id).catch(() => null);
      if (c && !("error" in c)) setChat((antes) => (antes && antes.id !== id ? antes : { id, ...c }));
    }
  }, []);

  // Al elegir una conversación se traen sus mensajes (y queda leída).
  useEffect(() => {
    if (!elegido) return;
    let vigente = true;
    abrirConversacion(elegido).then((c) => {
      if (!vigente) return;
      if ("error" in c) mostrarToast(c.error, "destructive");
      else setChat({ id: elegido, ...c });
    });
    return () => {
      vigente = false;
    };
  }, [elegido, mostrarToast]);

  // Se refresca sola mientras la pestaña del navegador está a la vista.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refrescar(elegido);
    }, REFRESCO_MS);
    return () => clearInterval(t);
  }, [elegido, refrescar]);

  const cantidadMensajes = chat?.mensajes.length ?? 0;
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [cantidadMensajes, chat?.id]);

  const numeroDe = useMemo(() => new Map(datos.numeros.map((n) => [n.id, n])), [datos.numeros]);
  const deNumero = useMemo(() => datos.conversaciones.filter((c) => numero === "todos" || c.numeroId === numero), [datos.conversaciones, numero]);
  const cuentas = { sinResponder: deNumero.filter(sinResponder).length, mias: deNumero.filter((c) => c.asignadaAId === miId).length, todas: deNumero.length };
  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return deNumero
      .filter((c) => (pestana === "sinResponder" ? sinResponder(c) : pestana === "mias" ? c.asignadaAId === miId : true))
      .filter((c) => !q || [c.nombre, c.nombrePerfil, c.telefono, c.codigo, ...c.tiendas].some((x) => x?.toLowerCase().includes(q)));
  }, [deNumero, pestana, buscar, miId]);

  const sel = datos.conversaciones.find((c) => c.id === elegido) ?? null;
  const ventana = sel ? textoVentana(sel.ultimoEntranteEn) : null;
  const esNota = modo === "nota";
  const bloqueado = !escribe || (!esNota && !ventana);

  function mandar() {
    if (!sel || !borrador.trim() || bloqueado) return;
    const texto = borrador;
    empezar(async () => {
      const r = await (esNota ? notaWhatsapp(sel.id, texto) : enviarWhatsapp(sel.id, texto)).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if ("error" in r) {
        mostrarToast(r.error, "destructive");
        return;
      }
      setBorrador("");
      await refrescar(sel.id);
    });
  }

  function accion(fn: () => Promise<{ ok: true } | { error: string }>, ok: string) {
    if (!sel) return;
    const id = sel.id;
    empezar(async () => {
      const r = await fn().catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      mostrarToast("error" in r ? r.error : ok, "error" in r ? "destructive" : undefined);
      await refrescar(id);
    });
  }

  if (!datos.numeros.length) {
    return (
      <section className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card px-5 py-6">
        <h2 className="m-0 text-base font-semibold">WhatsApp todavía no está conectado</h2>
        <p className="m-0 max-w-2xl text-sm text-muted-foreground">
          Falta conectar el número de la empresa (con 360dialog o directo con Meta) y poner sus datos en el servidor. Cuando llegue el primer mensaje, el número aparece aquí solo. Los
          pasos están en el Centro de ayuda, en «CRM Dropshippers › Bandeja de WhatsApp».
        </p>
        {estado360 && (
          <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0 text-[13px]" aria-label="Datos de 360dialog en el servidor">
            <li className={estado360.clave ? "text-success" : "text-destructive"}>
              {estado360.clave ? `✓ Clave de 360dialog cargada${estado360.sandbox ? " (sandbox)" : ""}` : "✗ Falta D360_API_KEY en el servidor (Vercel, Production) y volver a desplegar"}
            </li>
            <li className={estado360.palabraSecreta ? "text-success" : "text-destructive"}>
              {estado360.palabraSecreta ? "✓ Palabra secreta del webhook cargada" : "✗ Falta D360_WEBHOOK_CLAVE (16 caracteres o más) en el servidor"}
            </li>
          </ul>
        )}
        {estado360?.clave && (
          <button
            type="button"
            disabled={enviando}
            className={`mt-2 inline-flex min-h-9 items-center rounded-lg border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
            onClick={() =>
              empezar(async () => {
                const r = await conectarWebhook360().catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
                mostrarToast("error" in r ? r.error : "Listo: 360dialog ya manda los mensajes al sistema. Escríbele al número para probar.", "error" in r ? "destructive" : undefined);
              })
            }
          >
            Conectar el webhook de 360dialog
          </button>
        )}
      </section>
    );
  }

  const boton = `inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

  return (
    <div className="flex min-h-[640px] overflow-hidden rounded-xl border border-border bg-card lg:h-[calc(100vh-200px)]">
      {/* Conversaciones */}
      <aside aria-label="Conversaciones" className={`${sel ? "hidden lg:flex" : "flex"} w-full flex-col border-border lg:w-[320px] lg:flex-none lg:border-r`}>
        <div className="flex flex-col gap-2 border-b border-border p-2.5">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="buscar-chat">
              Buscar conversación
            </label>
            <input
              id="buscar-chat"
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar nombre, teléfono o tienda"
              className={`min-h-9 min-w-0 flex-1 rounded-lg border border-border-control bg-background px-3 text-sm ${anilloFoco}`}
            />
            {datos.numeros.length > 1 && (
              <>
                <label className="sr-only" htmlFor="numero-chat">
                  Número de la empresa
                </label>
                <select id="numero-chat" value={numero} onChange={(e) => setNumero(e.target.value)} className={`min-h-9 max-w-[45%] rounded-lg border border-border-control bg-background px-2 text-[13px] ${anilloFoco}`}>
                  <option value="todos">Todos los números</option>
                  {datos.numeros.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <div role="tablist" aria-label="Qué conversaciones ver" className="flex gap-1">
            {(
              [
                ["sinResponder", "Sin responder"],
                ["mias", "Mías"],
                ["todas", "Todas"],
              ] as [Pestana, string][]
            ).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={pestana === id}
                onClick={() => setPestana(id)}
                className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium ${pestana === id ? "bg-primario-suave text-primario" : "text-foreground-soft hover:bg-muted"} ${anilloFoco}`}
              >
                {texto} <span className="tabular-nums opacity-80">{cuentas[id]}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="m-0 flex-1 list-none overflow-y-auto p-0">
          {lista.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setElegido(c.id);
                  setChat((x) => (x?.id === c.id ? x : null));
                  // Al abrirla queda leída (el servidor la marca en `abrirConversacion`).
                  setDatos((d) => ({ ...d, conversaciones: d.conversaciones.map((x) => (x.id === c.id ? { ...x, noLeidos: 0 } : x)) }));
                }}
                aria-current={c.id === elegido ? "true" : undefined}
                className={`flex w-full gap-2.5 border-b border-border px-3.5 py-3 text-left ${c.id === elegido ? "bg-primario-suave" : "hover:bg-muted"} ${anilloFoco}`}
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primario-suave text-xs font-semibold text-primario">{iniciales(c.nombre)}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.nombre}</span>
                    <span className={`flex-none text-xs ${c.noLeidos ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{horaCorta(c.ultimoMensajeEn)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-[13px] ${c.noLeidos ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {c.ultimoDe === "saliente" ? "Tú: " : ""}
                      {c.ultimoTexto ?? ""}
                    </span>
                    {c.noLeidos > 0 && (
                      <span className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white" aria-label={`${c.noLeidos} sin leer`}>
                        {c.noLeidos}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                    {!c.dropshipperId && <span className="rounded bg-warning-soft px-1.5 text-warning">No está en el CRM</span>}
                    {c.estado === "resuelta" && <span className="rounded bg-success-soft px-1.5 text-success">Resuelta</span>}
                    {areas.length > 1 && <span className={`rounded px-1.5 font-medium ${areaChat(c.area).clase}`}>{areaChat(c.area).etiqueta}</span>}
                    {datos.numeros.length > 1 && <span>{numeroDe.get(c.numeroId)?.nombre}</span>}
                    {c.asignadaA && <span>· {c.asignadaA}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!lista.length && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{pestana === "sinResponder" ? "Nada sin responder." : "No hay conversaciones."}</li>}
        </ul>
      </aside>

      {/* Chat */}
      {sel ? (
        <section aria-label={`Conversación con ${sel.nombre}`} className="flex min-w-0 flex-1 flex-col bg-muted/40">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" onClick={() => setElegido(null)} className={`${boton} lg:hidden`} aria-label="Volver a las conversaciones">
                ←
              </button>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-semibold">{sel.nombre}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {sel.telefono}
                  {sel.nombrePerfil && sel.nombrePerfil !== sel.nombre ? ` · «${sel.nombrePerfil}» en WhatsApp` : ""} · {numeroDe.get(sel.numeroId)?.nombre}
                </span>
              </div>
            </div>
            {escribe && (
              <div className="flex flex-wrap gap-1.5">
                <label className="sr-only" htmlFor="area-chat">
                  Área del chat
                </label>
                <select
                  id="area-chat"
                  value={sel.area}
                  disabled={enviando}
                  onChange={(e) => {
                    const destino = e.target.value as AreaCrm;
                    const queda = areas.includes(destino);
                    accion(
                      () => pasarConversacionDeArea(sel.id, destino),
                      queda ? `Chat pasado a ${areaChat(destino).etiqueta}` : `Chat pasado a ${areaChat(destino).etiqueta}: ya no lo verás en tu bandeja`,
                    );
                    if (!queda) setElegido(null);
                  }}
                  className={`min-h-9 rounded-lg border border-border bg-card px-2 text-[13px] font-medium ${areaChat(sel.area).clase} ${anilloFoco}`}
                >
                  {AREAS_CHAT.map((a) => (
                    <option key={a.valor} value={a.valor}>
                      {a.valor === sel.area ? `Área: ${a.etiqueta}` : `Pasar a ${a.etiqueta}`}
                    </option>
                  ))}
                </select>
                {sel.asignadaAId === miId ? (
                  <button type="button" disabled={enviando} className={boton} onClick={() => accion(() => tomarConversacion(sel.id, true), "Conversación soltada")}>
                    Soltar
                  </button>
                ) : (
                  <button type="button" disabled={enviando} className={boton} onClick={() => accion(() => tomarConversacion(sel.id), "Ahora la llevas tú")}>
                    {sel.asignadaA ? `Tomar (la lleva ${sel.asignadaA})` : "Tomar"}
                  </button>
                )}
                {sel.estado === "abierta" ? (
                  <button
                    type="button"
                    disabled={enviando}
                    className={`${boton} border-success/40 bg-success-soft text-success hover:bg-success-soft`}
                    onClick={() => accion(() => cambiarEstadoConversacion(sel.id, "resuelta"), "Marcada resuelta")}
                  >
                    Marcar resuelta
                  </button>
                ) : (
                  <button type="button" disabled={enviando} className={boton} onClick={() => accion(() => cambiarEstadoConversacion(sel.id, "abierta"), "Conversación reabierta")}>
                    Reabrir
                  </button>
                )}
              </div>
            )}
          </div>
          <p className={`m-0 px-4 py-1.5 text-xs ${ventana ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
            {ventana
              ? `Ventana de 24 h abierta · ${ventana} para responder con texto libre`
              : "Pasaron más de 24 h desde su último mensaje: por WhatsApp solo se le puede escribir con una plantilla aprobada (próximamente). Las notas privadas sí se pueden dejar."}
          </p>
          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
            {!chat || chat.id !== sel.id ? (
              <p className="m-0 text-sm text-muted-foreground">Cargando…</p>
            ) : (
              chat.mensajes.map((m) => {
                const nuestro = m.direccion !== "entrante";
                const nota = m.direccion === "nota";
                return (
                  <div key={m.id} className={`flex ${nuestro ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                        nota ? "border border-dashed border-warning bg-warning-soft" : nuestro ? "border border-primario/20 bg-primario-suave" : "border border-border bg-card"
                      }`}
                    >
                      {nota && <span className="mb-0.5 block text-[11px] font-semibold text-warning">Nota privada · solo la ve el equipo</span>}
                      <Contenido m={m} />
                      <span className={`mt-1 block text-right text-[11px] ${m.estado === "fallido" ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                        {nuestro && m.autor ? `${m.autor} · ` : ""}
                        {horaMensaje(m.momento)}
                        {m.direccion === "saliente" ? ` · ${ESTADO_SALIENTE[m.estado] ?? m.estado}` : ""}
                      </span>
                      {m.estado === "fallido" && m.error && <span className="block text-[11px] text-destructive">{m.error}</span>}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={finRef} />
          </div>
          {escribe ? (
            <div className="flex flex-col gap-2 border-t border-border bg-card px-3 py-2.5">
              <div role="tablist" aria-label="Tipo de mensaje" className="flex gap-1">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!esNota}
                  onClick={() => setModo("responder")}
                  className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium ${!esNota ? "bg-primario-suave text-primario" : "text-foreground-soft hover:bg-muted"} ${anilloFoco}`}
                >
                  Responder por WhatsApp
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={esNota}
                  onClick={() => setModo("nota")}
                  className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium ${esNota ? "bg-warning-soft text-warning" : "text-foreground-soft hover:bg-muted"} ${anilloFoco}`}
                >
                  Nota privada
                </button>
              </div>
              <label className="sr-only" htmlFor="mensaje-chat">
                {esNota ? "Nota privada" : "Mensaje"}
              </label>
              <textarea
                id="mensaje-chat"
                rows={3}
                value={borrador}
                disabled={bloqueado}
                onChange={(e) => setBorrador(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    mandar();
                  }
                }}
                placeholder={esNota ? "Nota para el equipo: el dropshipper no la ve" : ventana ? `Escribe la respuesta a ${sel.nombre.split(" ")[0]} (Ctrl + Enter envía)` : "Fuera de las 24 h: hace falta una plantilla aprobada"}
                className={`w-full resize-y rounded-lg border px-3 py-2 text-sm disabled:opacity-60 ${esNota ? "border-warning bg-warning-soft/40" : "border-border-control bg-background"} ${anilloFoco}`}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={enviando || bloqueado || !borrador.trim()}
                  onClick={mandar}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primario px-4 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}
                >
                  {enviando ? "Enviando…" : esNota ? "Guardar nota" : "Enviar"}
                </button>
              </div>
            </div>
          ) : (
            <p className="m-0 border-t border-border bg-card px-4 py-3 text-sm text-muted-foreground">Tienes acceso de solo lectura al CRM.</p>
          )}
        </section>
      ) : (
        <div className="hidden flex-1 items-center justify-center p-8 text-sm text-muted-foreground lg:flex">Elige una conversación para verla.</div>
      )}

      {/* El dropshipper */}
      {sel && (
        <aside aria-label="El dropshipper" className="hidden w-[280px] flex-none flex-col gap-4 overflow-y-auto border-l border-border p-4 xl:flex">
          <div className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-primario-suave font-semibold text-primario">{iniciales(sel.nombre)}</span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-semibold">{sel.nombre}</span>
              {sel.codigo && <span className="text-xs text-muted-foreground">{sel.codigo}</span>}
            </div>
          </div>
          {chat?.id === sel.id && chat.dropshipper ? (
            <>
              <div className="flex flex-wrap gap-1">
                <span className="rounded-[5px] bg-success-soft px-2 py-0.5 text-xs font-medium text-success capitalize">{chat.dropshipper.estado}</span>
                {chat.dropshipper.cuentas.map((c) => (
                  <span key={c} className="rounded-[5px] bg-muted px-2 py-0.5 text-xs font-medium text-foreground-soft">
                    {c}
                  </span>
                ))}
              </div>
              {chat.dropshipper.tiendas.length > 0 && <p className="m-0 text-[13px] text-muted-foreground">Tienda: {chat.dropshipper.tiendas.join(", ")}</p>}
              <div className="flex flex-col gap-2">
                <h2 className="m-0 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">Casos abiertos</h2>
                {chat.dropshipper.casos.length ? (
                  chat.dropshipper.casos.map((c) => (
                    <div key={c.codigo} className="rounded-lg border border-warning/40 bg-warning-soft/50 px-2.5 py-2 text-[13px]">
                      {c.codigo} · {c.titulo}
                      {c.prioridad === "alta" && <span className="font-semibold text-destructive"> · alta</span>}
                    </div>
                  ))
                ) : (
                  <p className="m-0 text-[13px] text-muted-foreground">Ninguno.</p>
                )}
              </div>
              <Link href={`/crm-dropshippers?abrir=${chat.dropshipper.id}`} className={`text-[13px] font-medium text-primario hover:underline ${anilloFoco}`}>
                Abrir su ficha →
              </Link>
            </>
          ) : !sel.dropshipperId ? (
            <div className="flex flex-col gap-2 text-[13px]">
              <p className="m-0 text-muted-foreground">Este WhatsApp no está en el CRM. Si es un dropshipper, agrégalo (o pon este número en su ficha) y la conversación queda enlazada con el próximo mensaje.</p>
              <Link href={`/crm-dropshippers?buscar=${encodeURIComponent(sel.nombrePerfil ?? sel.telefono)}`} className={`font-medium text-primario hover:underline ${anilloFoco}`}>
                Buscarlo en el CRM →
              </Link>
            </div>
          ) : null}
        </aside>
      )}
    </div>
  );
}
