"use client";

/* eslint-disable @next/next/no-img-element -- fotos que llegan por WhatsApp, servidas por /api/whatsapp/media */
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { textoVentana } from "@/lib/whatsapp/ventana";
import type { AreaCrm } from "@/lib/crm/areas";
import { abrirConversacion, cambiarEstadoConversacion, conectarWebhook360, enviarWhatsapp, notaWhatsapp, obtenerBandeja, pasarConversacionDeArea, tomarConversacion } from "./actions";
import type { ConversacionVista, MensajeVista, NumeroVista, ResumenDropshipper } from "./datos-bandeja";

/** Qué conversaciones se ven: las pestañas de siempre o, con más de un área, las de un área. */
type Filtro = "sinResponder" | "mias" | "todas" | `area:${AreaCrm}`;
const REFRESCO_MS = 8000;

/** Las áreas de un chat, con el color de su etiqueta y para qué es cada una (boceto https://claude.ai/artifact/Sn3pB4cdUixXk6WdRh4kr8). */
const AREAS_CHAT: { valor: AreaCrm; etiqueta: string; clase: string; para: string }[] = [
  { valor: "atencion", etiqueta: "Atención", clase: "bg-azul-soft text-azul", para: "Soporte: guías, garantías, stock" },
  { valor: "comercial", etiqueta: "Comercial", clase: "bg-success-soft text-success", para: "Precios, volumen, reactivación" },
  { valor: "direccion", etiqueta: "Dirección", clase: "bg-primario-suave text-primario", para: "Solo la ve el CEO" },
];
const areaChat = (a: AreaCrm) => AREAS_CHAT.find((x) => x.valor === a) ?? AREAS_CHAT[0];

/** Respuestas de un toque para lo que más se repite en Atención. */
const RAPIDAS = ["Ya reviso tu guía y te confirmo 👌", "¿Me compartes el número de pedido?", "Te paso el estado en un momento"];

/** La nota que deja «Pasar a otra área» (actions.ts): se dibuja como aviso del sistema, no como nota de una persona. */
const ES_CAMBIO_DE_AREA = /^.+ pasó este chat de (Atención|Comercial|Dirección) a (Atención|Comercial|Dirección)\.$/;

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

const horaMensaje = (iso: string) => new Date(iso).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" });

/** El separador de día del chat: «Hoy», «Ayer» o «lunes 26 oct». */
function etiquetaDia(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === new Date(hoy.getTime() - 86_400_000).toDateString()) return "Ayer";
  return d.toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "short" });
}

const ESTADO_SALIENTE: Record<string, string> = { enviando: "Enviando", enviado: "Enviado ✓", entregado: "Entregado ✓✓", leido: "Leído ✓✓", fallido: "No se entregó" };

/** La etiqueta de color de un área, con su punto. */
function EtiquetaArea({ area }: { area: AreaCrm }) {
  const a = areaChat(area);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-semibold ${a.clase}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {a.etiqueta}
    </span>
  );
}

/** El contenido de un mensaje: su texto y, si trae un archivo, la foto, el audio, el video o el enlace para bajarlo. */
function Contenido({ m }: { m: MensajeVista }) {
  const src = `/api/whatsapp/media/${m.id}`;
  return (
    <>
      {m.conArchivo && m.tipo === "imagen" && (
        <a href={src} target="_blank" rel="noreferrer" className={`mb-1 block ${anilloFoco}`}>
          <img src={src} alt={m.texto ? `Foto: ${m.texto}` : "Foto que mandó por WhatsApp"} loading="lazy" className="max-h-64 max-w-full rounded-lg object-contain" />
        </a>
      )}
      {m.conArchivo && m.tipo === "sticker" && <img src={src} alt="Sticker" loading="lazy" className="h-28 w-28 object-contain" />}
      {m.conArchivo && m.tipo === "audio" && <audio controls preload="none" src={src} className="max-w-full" />}
      {m.conArchivo && m.tipo === "video" && <video controls preload="none" src={src} className="max-h-64 max-w-full rounded-lg" />}
      {m.conArchivo && m.tipo === "documento" && (
        <a href={src} target="_blank" rel="noreferrer" className={`mb-1 flex items-center gap-2 rounded-lg bg-muted px-2 py-1.5 text-[13px] font-medium text-primario ${anilloFoco}`}>
          <span aria-hidden="true" className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-primario-suave text-[10px] font-bold">
            DOC
          </span>
          <span className="truncate">{m.mediaNombre ?? "Abrir documento"}</span>
        </a>
      )}
      {m.tipo === "reaccion" && <span className="text-muted-foreground">Reaccionó </span>}
      {m.tipo === "ubicacion" && <span className="block text-xs font-medium text-muted-foreground">Ubicación</span>}
      {m.texto ? <span className="block whitespace-pre-wrap break-words">{m.texto}</span> : !m.conArchivo && m.tipo !== "reaccion" && <span className="text-muted-foreground">Mensaje que el sistema todavía no muestra ({m.tipo}).</span>}
    </>
  );
}

/**
 * La bandeja de WhatsApp (26 oct 2026; diseño del boceto https://claude.ai/artifact/Sn3pB4cdUixXk6WdRh4kr8, 28 oct): a la izquierda el
 * número y las conversaciones (Sin responder, Mías, Todas y, con más de un área, cada área), al centro el chat para contestar o dejar
 * una nota privada, con «Pasar a otra área», y a la derecha el dropshipper. Se refresca sola cada pocos segundos mientras está a la vista.
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
  /** Las áreas que ve la persona: con más de una, cada chat muestra la suya y se puede filtrar por área. */
  areas: AreaCrm[];
  /** Solo para quien administra: qué datos de 360dialog tiene el servidor (si están, no su valor). Con la clave, puede registrar el webhook. */
  estado360?: { clave: boolean; sandbox: boolean; palabraSecreta: boolean } | null;
}) {
  const { mostrarToast } = useToast();
  const [datos, setDatos] = useState(inicial);
  const [filtro, setFiltro] = useState<Filtro>(abrirInicial ? "todas" : "sinResponder");
  const [numero, setNumero] = useState<string>("todos");
  const [buscar, setBuscar] = useState("");
  const [elegido, setElegido] = useState<string | null>(abrirInicial);
  const [chat, setChat] = useState<{ id: string; mensajes: MensajeVista[]; dropshipper: ResumenDropshipper | null } | null>(null);
  const [modo, setModo] = useState<"responder" | "nota">("responder");
  const [borrador, setBorrador] = useState("");
  const [menuArea, setMenuArea] = useState(false);
  const [enviando, empezar] = useTransition();
  const finRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);

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

  // El menú «Pasar a otra área» se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!menuArea) return;
    const fuera = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuArea(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuArea(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [menuArea]);

  const cantidadMensajes = chat?.mensajes.length ?? 0;
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [cantidadMensajes, chat?.id]);

  const numeroDe = useMemo(() => new Map(datos.numeros.map((n) => [n.id, n])), [datos.numeros]);
  const deNumero = useMemo(() => datos.conversaciones.filter((c) => numero === "todos" || c.numeroId === numero), [datos.conversaciones, numero]);
  const opciones: { id: Filtro; texto: string; cuenta: number }[] = [
    { id: "sinResponder", texto: "Sin responder", cuenta: deNumero.filter(sinResponder).length },
    { id: "mias", texto: "Mías", cuenta: deNumero.filter((c) => c.asignadaAId === miId).length },
    { id: "todas", texto: "Todas", cuenta: deNumero.length },
    ...(areas.length > 1 ? areas.map((a) => ({ id: `area:${a}` as Filtro, texto: areaChat(a).etiqueta, cuenta: deNumero.filter((c) => c.area === a).length })) : []),
  ];
  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return deNumero
      .filter((c) =>
        filtro === "sinResponder" ? sinResponder(c) : filtro === "mias" ? c.asignadaAId === miId : filtro === "todas" ? true : c.area === filtro.slice(5),
      )
      .filter((c) => !q || [c.nombre, c.nombrePerfil, c.telefono, c.codigo, ...c.tiendas].some((x) => x?.toLowerCase().includes(q)));
  }, [deNumero, filtro, buscar, miId]);

  const sel = datos.conversaciones.find((c) => c.id === elegido) ?? null;
  const ventana = sel ? textoVentana(sel.ultimoEntranteEn) : null;
  const esNota = modo === "nota";
  const bloqueado = !escribe || (!esNota && !ventana);
  const mensajes = chat && sel && chat.id === sel.id ? chat.mensajes : null;
  const cambiosDeArea = (mensajes ?? []).filter((m) => m.direccion === "nota" && ES_CAMBIO_DE_AREA.test(m.texto ?? ""));

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

  function pasarA(destino: AreaCrm) {
    if (!sel) return;
    setMenuArea(false);
    const queda = areas.includes(destino);
    accion(() => pasarConversacionDeArea(sel.id, destino), queda ? `Chat pasado a ${areaChat(destino).etiqueta}.` : `Chat pasado a ${areaChat(destino).etiqueta}. Ya no lo verás en tu bandeja.`);
    if (!queda) setElegido(null);
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

  const boton = `inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[12.5px] font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
  const etiquetaSeccion = "m-0 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase";
  const unNumero = datos.numeros.length === 1 ? datos.numeros[0] : null;

  return (
    <div className="flex min-h-[640px] overflow-hidden rounded-[14px] border border-border bg-card lg:h-[calc(100vh-200px)]">
      {/* Conversaciones */}
      <aside aria-label="Conversaciones" className={`${sel ? "hidden lg:flex" : "flex"} w-full flex-col border-border lg:w-[320px] lg:flex-none lg:border-r`}>
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
          <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-success-soft text-[13px] font-bold text-success">
            W
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold">{unNumero ? unNumero.nombre : `${datos.numeros.length} números de WhatsApp`}</span>
            <span className="truncate text-xs text-muted-foreground tabular-nums">{unNumero ? `${unNumero.numero} · un número para todo el equipo` : "Elige cuál ver abajo"}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 border-b border-border px-3.5 py-2.5">
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
              className={`min-h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] ${anilloFoco}`}
            />
            {datos.numeros.length > 1 && (
              <>
                <label className="sr-only" htmlFor="numero-chat">
                  Número de la empresa
                </label>
                <select id="numero-chat" value={numero} onChange={(e) => setNumero(e.target.value)} className={`min-h-9 max-w-[45%] rounded-lg border border-border bg-background px-2 text-[13px] ${anilloFoco}`}>
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
          <div role="group" aria-label="Qué conversaciones ver" className="flex flex-wrap gap-1.5">
            {opciones.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={filtro === o.id}
                onClick={() => setFiltro(o.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  filtro === o.id ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground-soft hover:bg-muted"
                } ${anilloFoco}`}
              >
                {o.texto} <span className="tabular-nums opacity-80">{o.cuenta}</span>
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
                  setMenuArea(false);
                  setChat((x) => (x?.id === c.id ? x : null));
                  // Al abrirla queda leída (el servidor la marca en `abrirConversacion`).
                  setDatos((d) => ({ ...d, conversaciones: d.conversaciones.map((x) => (x.id === c.id ? { ...x, noLeidos: 0 } : x)) }));
                }}
                aria-current={c.id === elegido ? "true" : undefined}
                className={`grid w-full grid-cols-[34px_minmax(0,1fr)_auto] gap-2.5 border-b border-border px-3.5 py-3 text-left ${c.id === elegido ? "bg-primario-suave" : "hover:bg-muted"} ${anilloFoco}`}
              >
                <span aria-hidden="true" className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground-soft">
                  {iniciales(c.nombre)}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-semibold">{c.nombre}</span>
                  <span className={`truncate text-xs ${c.noLeidos ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {c.ultimoDe === "saliente" ? "Tú: " : ""}
                    {c.ultimoTexto ?? ""}
                  </span>
                  {(areas.length > 1 || !c.dropshipperId || c.estado === "resuelta" || c.asignadaA || datos.numeros.length > 1) && (
                    <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      {areas.length > 1 && <EtiquetaArea area={c.area} />}
                      {!c.dropshipperId && <span className="rounded-full bg-warning-soft px-2 py-px font-medium text-warning">No está en el CRM</span>}
                      {c.estado === "resuelta" && <span className="rounded-full bg-success-soft px-2 py-px font-medium text-success">Resuelta</span>}
                      {datos.numeros.length > 1 && <span>{numeroDe.get(c.numeroId)?.nombre}</span>}
                      {c.asignadaA && <span>· {c.asignadaA}</span>}
                    </span>
                  )}
                </span>
                <span className="flex flex-col items-end gap-1 text-[11px] text-muted-foreground tabular-nums">
                  <span className={c.noLeidos ? "font-semibold text-destructive" : ""}>{horaCorta(c.ultimoMensajeEn)}</span>
                  {c.noLeidos > 0 && (
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white" aria-label={`${c.noLeidos} sin leer`}>
                      {c.noLeidos}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {!lista.length && <li className="px-4 py-8 text-center text-[13px] text-muted-foreground">{filtro === "sinResponder" ? "Nada sin responder." : "No hay conversaciones con este filtro."}</li>}
        </ul>
      </aside>

      {/* Chat */}
      {sel ? (
        <section aria-label={`Conversación con ${sel.nombre}`} className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-card px-3.5 py-2.5">
            <button type="button" onClick={() => setElegido(null)} className={`${boton} lg:hidden`} aria-label="Volver a las conversaciones">
              ←
            </button>
            <span aria-hidden="true" className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground-soft">
              {iniciales(sel.nombre)}
            </span>
            <div className="flex min-w-0 flex-[1_1_180px] flex-col">
              <span className="truncate text-sm font-semibold">{sel.nombre}</span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {sel.telefono}
                {sel.codigo ? ` · ${sel.codigo}` : ""}
                {sel.nombrePerfil && sel.nombrePerfil !== sel.nombre ? ` · «${sel.nombrePerfil}» en WhatsApp` : ""}
                {datos.numeros.length > 1 ? ` · ${numeroDe.get(sel.numeroId)?.nombre}` : ""}
              </span>
            </div>
            <EtiquetaArea area={sel.area} />
            {escribe && (
              <>
                {sel.asignadaAId === miId ? (
                  <button type="button" disabled={enviando} className={boton} onClick={() => accion(() => tomarConversacion(sel.id, true), "Soltaste la conversación.")}>
                    Soltar
                  </button>
                ) : (
                  <button type="button" disabled={enviando} className={boton} onClick={() => accion(() => tomarConversacion(sel.id), "La conversación quedó a tu cargo.")}>
                    {sel.asignadaA ? `Tomar (la lleva ${sel.asignadaA})` : "Tomar"}
                  </button>
                )}
                <div ref={menuRef} className="relative">
                  <button
                    type="button"
                    disabled={enviando}
                    aria-haspopup="menu"
                    aria-expanded={menuArea}
                    onClick={() => setMenuArea((v) => !v)}
                    className={`boton-neon inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-[12.5px] font-medium text-white disabled:opacity-50 ${anilloFoco}`}
                  >
                    Pasar a otra área ▾
                  </button>
                  {menuArea && (
                    <div role="menu" aria-label="Pasar a otra área" className="absolute top-[calc(100%+6px)] right-0 z-20 flex w-64 flex-col rounded-[10px] border border-border bg-card p-1.5 shadow-lg">
                      <p className="m-0 px-2 pt-1 pb-1.5 text-[11.5px] text-muted-foreground">El chat pasa a esa área. Quien no la ve deja de verlo.</p>
                      {AREAS_CHAT.filter((a) => a.valor !== sel.area).map((a) => (
                        <button key={a.valor} type="button" role="menuitem" onClick={() => pasarA(a.valor)} className={`flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted ${anilloFoco}`}>
                          <EtiquetaArea area={a.valor} />
                          <span className="text-[11.5px] text-muted-foreground">{a.para}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {sel.estado === "abierta" ? (
                  <button type="button" disabled={enviando} className={boton} onClick={() => accion(() => cambiarEstadoConversacion(sel.id, "resuelta"), "Marcada resuelta. Si vuelve a escribir, se reabre sola.")}>
                    Marcar resuelta
                  </button>
                ) : (
                  <button type="button" disabled={enviando} className={boton} onClick={() => accion(() => cambiarEstadoConversacion(sel.id, "abierta"), "Conversación reabierta.")}>
                    Reabrir
                  </button>
                )}
              </>
            )}
          </div>
          <p className={`m-0 border-b border-border px-3.5 py-1.5 text-xs ${ventana ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
            {ventana
              ? `Ventana de 24 h abierta: se puede responder con texto libre durante ${ventana.replace(/^quedan /, "")} más.`
              : "Pasaron más de 24 h desde su último mensaje: por WhatsApp solo se le puede escribir con una plantilla aprobada (próximamente). Las notas privadas sí se pueden dejar."}
          </p>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-muted p-4">
            {!mensajes ? (
              <p className="m-0 text-[13px] text-muted-foreground">Cargando…</p>
            ) : (
              mensajes.map((m, i) => {
                const dia = etiquetaDia(m.momento);
                const separador = i === 0 || etiquetaDia(mensajes[i - 1].momento) !== dia;
                return (
                  <Fragment key={m.id}>
                    {separador && <span className="self-center rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] text-muted-foreground first-letter:uppercase">{dia}</span>}
                    <Burbuja m={m} />
                  </Fragment>
                );
              })
            )}
            <div ref={finRef} />
          </div>
          {escribe ? (
            <div className="flex flex-col gap-2 border-t border-border bg-card px-3.5 pt-2.5 pb-3">
              <div role="group" aria-label="Tipo de mensaje" className="flex gap-1">
                <button
                  type="button"
                  aria-pressed={!esNota}
                  onClick={() => setModo("responder")}
                  className={`rounded-md px-2.5 py-1 text-[12.5px] ${!esNota ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted"} ${anilloFoco}`}
                >
                  Responder por WhatsApp
                </button>
                <button
                  type="button"
                  aria-pressed={esNota}
                  onClick={() => setModo("nota")}
                  className={`rounded-md px-2.5 py-1 text-[12.5px] ${esNota ? "bg-warning-soft font-semibold text-warning" : "text-muted-foreground hover:bg-muted"} ${anilloFoco}`}
                >
                  Nota privada
                </button>
              </div>
              <label className="sr-only" htmlFor="mensaje-chat">
                {esNota ? "Nota privada" : "Mensaje"}
              </label>
              <textarea
                id="mensaje-chat"
                ref={textoRef}
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
                placeholder={esNota ? "Nota para el equipo. El dropshipper no la ve." : ventana ? `Escribe a ${sel.nombre.split(" ")[0]}… (Ctrl + Enter envía)` : "Fuera de las 24 h: hace falta una plantilla aprobada"}
                className={`min-h-16 w-full resize-y rounded-[10px] border px-3 py-2 text-sm disabled:opacity-60 ${esNota ? "border-transparent bg-warning-soft text-warning placeholder:text-warning/70" : "border-border bg-card"} ${anilloFoco}`}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {!esNota &&
                    !bloqueado &&
                    RAPIDAS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setBorrador(r);
                          textoRef.current?.focus();
                        }}
                        className={`rounded-full border border-dashed border-border px-2.5 py-0.5 text-[11.5px] text-foreground-soft hover:bg-muted ${anilloFoco}`}
                      >
                        {r}
                      </button>
                    ))}
                </div>
                <button
                  type="button"
                  disabled={enviando || bloqueado || !borrador.trim()}
                  onClick={mandar}
                  className={`boton-neon inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-transparent px-4 text-[13px] font-semibold text-white disabled:opacity-50 ${anilloFoco}`}
                >
                  {enviando ? "Enviando…" : esNota ? "Guardar nota" : "Enviar"}
                </button>
              </div>
            </div>
          ) : (
            <p className="m-0 border-t border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">Tienes acceso de solo lectura al CRM.</p>
          )}
        </section>
      ) : (
        <div className="hidden flex-1 items-center justify-center bg-muted p-8 text-[13px] text-muted-foreground lg:flex">Elige una conversación de la lista.</div>
      )}

      {/* El dropshipper */}
      {sel && (
        <aside aria-label="El dropshipper" className="hidden w-[280px] flex-none flex-col gap-4 overflow-y-auto border-l border-border p-3.5 xl:flex">
          <div className="flex flex-col">
            <h2 className="m-0 truncate text-[15px] font-semibold">{sel.nombre}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {sel.codigo ? `${sel.codigo} · ` : ""}
              {sel.telefono}
            </span>
          </div>
          {chat?.id === sel.id && chat.dropshipper ? (
            <>
              <div className="flex flex-col gap-1.5">
                <h3 className={etiquetaSeccion}>Dónde vende</h3>
                <div className="flex flex-wrap gap-1.5">
                  {[...chat.dropshipper.tiendas, ...chat.dropshipper.cuentas].map((t) => (
                    <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-[11.5px]">
                      {t}
                    </span>
                  ))}
                  {!chat.dropshipper.tiendas.length && !chat.dropshipper.cuentas.length && <span className="text-[12.5px] text-muted-foreground">Sin tiendas ni cuentas vinculadas.</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className={etiquetaSeccion}>Estado</h3>
                <span className="self-start rounded-full bg-success-soft px-2 py-px text-xs font-medium text-success capitalize">{chat.dropshipper.estado}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className={etiquetaSeccion}>Casos abiertos</h3>
                {chat.dropshipper.casos.length ? (
                  chat.dropshipper.casos.map((c) => (
                    <div key={c.codigo} className="rounded-lg border border-border px-2.5 py-1.5 text-[12.5px]">
                      <span className="block text-[11.5px] text-muted-foreground tabular-nums">
                        {c.codigo}
                        {c.prioridad === "alta" && <span className="font-semibold text-destructive"> · alta</span>}
                      </span>
                      {c.titulo}
                    </div>
                  ))
                ) : (
                  <span className="text-[12.5px] text-muted-foreground">Sin casos abiertos.</span>
                )}
              </div>
            </>
          ) : !sel.dropshipperId ? (
            <div className="flex flex-col gap-2 text-[12.5px]">
              <p className="m-0 text-muted-foreground">Este WhatsApp no está en el CRM. Si es un dropshipper, agrégalo (o pon este número en su ficha) y la conversación queda enlazada con el próximo mensaje.</p>
              <Link href={`/crm-dropshippers?buscar=${encodeURIComponent(sel.nombrePerfil ?? sel.telefono)}`} className={`font-medium text-primario hover:underline ${anilloFoco}`}>
                Buscarlo en el CRM →
              </Link>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <h3 className={etiquetaSeccion}>Área del chat</h3>
            <span className="self-start">
              <EtiquetaArea area={sel.area} />
            </span>
            <div className="flex flex-col gap-1 text-xs text-foreground-soft">
              {cambiosDeArea.length ? cambiosDeArea.map((m) => <span key={m.id}>{`${m.texto} · ${horaCorta(m.momento)}`}</span>) : <span>Entró a {areaChat(sel.area).etiqueta} con su primer mensaje.</span>}
            </div>
          </div>
          {chat?.id === sel.id && chat.dropshipper && (
            <Link href={`/crm-dropshippers?abrir=${chat.dropshipper.id}`} className={`inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted ${anilloFoco}`}>
              Abrir su ficha en el CRM
            </Link>
          )}
        </aside>
      )}
    </div>
  );
}

/** Un mensaje del chat: del dropshipper (izquierda), del equipo (derecha, lavanda), nota privada (ámbar, al centro) o cambio de área. */
function Burbuja({ m }: { m: MensajeVista }) {
  if (m.direccion === "nota" && ES_CAMBIO_DE_AREA.test(m.texto ?? "")) {
    return (
      <span className="self-center rounded-lg border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
        {m.texto} · {horaMensaje(m.momento)}
      </span>
    );
  }
  if (m.direccion === "nota") {
    return (
      <div className="max-w-[88%] self-center rounded-xl bg-warning-soft px-3 py-2 text-[13.5px] text-warning">
        <span className="block text-[11px] font-semibold tracking-[0.04em] uppercase">Nota privada</span>
        <Contenido m={m} />
        <span className="mt-1 block text-[10.5px]">
          {m.autor ? `${m.autor} · ` : ""}
          {horaMensaje(m.momento)} · el dropshipper no la ve
        </span>
      </div>
    );
  }
  const nuestro = m.direccion === "saliente";
  return (
    <div
      className={`max-w-[min(78%,520px)] rounded-xl px-3 py-2 text-[13.5px] leading-relaxed ${
        nuestro ? "self-end rounded-tr-sm bg-primario-suave" : "self-start rounded-tl-sm border border-border bg-card"
      }`}
    >
      <Contenido m={m} />
      <span className={`mt-1 flex flex-wrap justify-end gap-x-1.5 text-[10.5px] ${m.estado === "fallido" ? "font-medium text-destructive" : "text-muted-foreground"}`}>
        {nuestro && m.autor && <span>{m.autor}</span>}
        {nuestro && m.autor && <span aria-hidden="true">·</span>}
        <span>{horaMensaje(m.momento)}</span>
        {nuestro && (
          <>
            <span aria-hidden="true">·</span>
            <span className={m.estado === "leido" ? "text-azul" : ""}>{ESTADO_SALIENTE[m.estado] ?? m.estado}</span>
          </>
        )}
      </span>
      {m.estado === "fallido" && m.error && <span className="block text-[11px] text-destructive">{m.error}</span>}
    </div>
  );
}
