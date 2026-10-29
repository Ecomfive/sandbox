"use client";

/* eslint-disable @next/next/no-img-element -- fotos que llegan por WhatsApp, servidas por /api/whatsapp/media */
import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { supabase } from "@/lib/supabase/client";
import { CANAL_BANDEJA, EVENTO_NOVEDAD } from "@/lib/whatsapp/canal-bandeja";
import { textoVentana } from "@/lib/whatsapp/ventana";
import type { AreaCrm } from "@/lib/crm/areas";
import { quienesRespondieron } from "@/lib/crm/respondieron";
import { abrirConversacion, cambiarEstadoConversacion, fichaCrmDelChat, conectarWebhook360, marcarChatLeido, enviarWhatsapp, intervenirConversacion, mensajesAnteriores, notaWhatsapp, marcarChatBorradoEnApp, pasarConversacionDeArea, tomarConversacion, vistaPreviaChat } from "./actions";
import type { FichaCrmChat } from "./actions";
import type { ConversacionVista, DatosBandeja, MensajeVista, ResumenDropshipper, VistaPreviaMensaje } from "./datos-bandeja";
import { guardarColorEtiquetaChat, guardarEtiquetasChat } from "./etiquetas-actions";
import { EtiquetasChat, PastillasEtiquetas, SelectorEtiquetasChat, type ManejoEtiquetas } from "./etiquetas-chat";
import { claseBotonFicha, claseBotonFichaPrincipal, FichaDelChat, type OpcionMas } from "./ficha-chat";
import { VistaPreviaChat } from "./vista-previa-chat";
import { VentanaVincular } from "./vincular-chat";
import { ACEPTAR_ENVIO, EnviarArchivo } from "./enviar-archivo";
import { Expresiones } from "./expresiones";
import { GrabarVoz } from "./grabar-voz";
import { EditorNombreContacto } from "./nombre-contacto";
import { listarRespuestasRapidas, guardarRespuestaRapida, usarRespuestaRapida } from "./rapidas-actions";
import { VentanaRapidas } from "./respuestas-rapidas";
import { sugerirRapidas, validarRapida, yaEsRapida, type RespuestaRapida } from "@/lib/whatsapp/rapidas";
import { EnviarPlantilla } from "./enviar-plantilla";
import { ImportarChat } from "./importar-chat";
import { PedirBorrado, type QueBorrar } from "./pedir-borrado";
import { MostrarTelefono } from "../mostrar-telefono";
import { ChatIcon, CheckIcon, FlechaAbajoIcon, FlechaArribaIcon, PapeleraIcon, PersonaIcon, ReactivarIcon } from "@/lib/nav-icons";
import { Ventana } from "@/components/ui/ventana";
import { BotonNavegar } from "../ficha-lateral";
import { vistaPreviaTexto } from "@/lib/whatsapp/borrado";
import { agruparReacciones, type ReaccionVista } from "@/lib/whatsapp/reacciones";

/** Qué conversaciones del panel se ven. */
type Filtro = "sinResponder" | "mias" | "todas";
const REFRESCO_MS = 8000;
/** Con el aviso en tiempo real conectado (canal-bandeja.ts), el refresco solo queda de respaldo. */
const REFRESCO_RESPALDO_MS = 30000;

/** Lo que devuelve el refresco (`/api/whatsapp/bandeja`): la lista de chats y los últimos mensajes del chat abierto. */
type Refresco = { bandeja: DatosBandeja; chat: { id: string; mensajes: MensajeVista[]; dropshipper: ResumenDropshipper | null } | null };

/** Un mensaje que se muestra apenas se toca enviar, antes de que el servidor responda (id «local-…»). */
const esLocal = (m: MensajeVista) => m.id.startsWith("local-");
const idLocal = () => `local-${crypto.randomUUID()}`;
const ahoraIso = () => new Date().toISOString();

/** El turno de cada refresco: si dos se cruzan, vale el último que se pidió (hay una sola bandeja por página). */
const vueltas = { pedidas: 0, aplicada: 0 };

/** Las áreas de un chat, con el color de su etiqueta y para qué es cada una (boceto https://claude.ai/artifact/Sn3pB4cdUixXk6WdRh4kr8). */
const AREAS_CHAT: { valor: AreaCrm; etiqueta: string; clase: string; para: string }[] = [
  { valor: "atencion", etiqueta: "Atención", clase: "bg-azul-soft text-azul", para: "Soporte: guías, garantías, stock" },
  { valor: "comercial", etiqueta: "Comercial", clase: "bg-success-soft text-success", para: "Precios, volumen, reactivación" },
  { valor: "direccion", etiqueta: "Dirección", clase: "bg-primario-suave text-primario", para: "Solo la ve el CEO" },
];
const areaChat = (a: AreaCrm) => AREAS_CHAT.find((x) => x.valor === a) ?? AREAS_CHAT[0];
/** El color del punto de cada panel: el del texto de su etiqueta. */
const colorDeArea = (a: AreaCrm) => areaChat(a).clase.split(" ").find((x) => x.startsWith("text-")) ?? "";
/** Cuántas columnas en pantalla ancha, según los paneles que ve la persona (clases escritas enteras para que Tailwind las genere). */
const COLUMNAS_PANELES: Record<number, string> = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" };

/**
 * Cuánto lleva un chat sin respuesta, desde el último mensaje del dropshipper: «8 min», «1 h 15 min», «2 días». Verde hasta 15 minutos,
 * ámbar hasta la hora y rojo después. Se calcula al dibujar (la bandeja se refresca sola).
 */
function esperaDe(desde: string | null): { texto: string; clase: string } | null {
  if (!desde) return null;
  const min = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 60_000));
  const texto = min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${Math.floor(min / 1440)} día${min >= 2880 ? "s" : ""}`;
  return { texto, clase: min < 15 ? "text-[var(--wa-acento)]" : min < 60 ? "text-warning" : "text-destructive" };
}

/** Respuestas de un toque para lo que más se repite en Atención. */
/** Los mensajes rápidos de siempre: se usan mientras no exista la tabla de la migración 0179. */
const RAPIDAS_BASE: RespuestaRapida[] = ["Hola, ¿cómo estás? 👋", "Ya reviso tu guía y te confirmo 👌", "¿Me compartes el número de pedido?", "Te paso el estado en un momento"].map((texto, i) => ({ id: `base-${i}`, texto, usos: 0 }));

/** La nota que deja «Pasar a otra área» (actions.ts): se dibuja como aviso del sistema, no como nota de una persona. */
const ES_CAMBIO_DE_AREA = /^.+ pasó este chat de (Atención|Comercial|Dirección) a (Atención|Comercial|Dirección)\.$/;
/** Las notas que deja «Marcar borrado en la app» (actions.ts): también son avisos del sistema. */
const ES_MARCA_BORRADO = /^.+ (marcó este chat como borrado en la app de WhatsApp Business|quitó la marca de «borrado en la app de WhatsApp Business»)\.$/;
/** La nota que deja «Intervenir» (supervisión): aviso del sistema. */
const ES_INTERVINO = /^.+ intervino en este chat\.$/;
const esAvisoDelSistema = (texto: string | null) => ES_CAMBIO_DE_AREA.test(texto ?? "") || ES_MARCA_BORRADO.test(texto ?? "") || ES_INTERVINO.test(texto ?? "");

const iniciales = (nombre: string) =>
  nombre
    .replace(/^\+/, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** El color de la foto de cada chat, siempre el mismo para el mismo nombre (oscuros: el texto blanco se lee bien). */
const COLORES_FOTO = ["#a1517a", "#2f7d6d", "#4a6fa5", "#8a6d1d", "#6b5b95", "#b0573c", "#3d7a8f", "#7a5c3e"];
function colorFoto(nombre: string): string {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES_FOTO[h % COLORES_FOTO.length];
}

type ChatAbierto = { id: string; mensajes: MensajeVista[]; hayAnteriores: boolean; dropshipper: ResumenDropshipper | null };

/**
 * Junta lo que ya se veía con lo que trae el refresco: el refresco trae los 300 más recientes y, con «Ver mensajes anteriores» (o un chat
 * importado largo), lo de antes se queda; lo repetido se toma del refresco (su estado, palomitas, puede haber cambiado).
 */
function unirMensajes(antes: MensajeVista[], nuevos: MensajeVista[]): MensajeVista[] {
  const porId = new Map(antes.map((m) => [m.id, m]));
  for (const m of nuevos) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) => (a.momento < b.momento ? -1 : a.momento > b.momento ? 1 : 0));
}

const sinResponder = (c: ConversacionVista) => c.estado === "abierta" && (c.noLeidos > 0 || c.ultimoDe === "entrante");

/** «14:05» si es de hoy, «Ayer», «26 oct». */
function horaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" });
  const ayer = new Date(hoy.getTime() - 86_400_000);
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
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

const ESTADO_SALIENTE: Record<string, string> = { enviando: "Enviando", enviado: "Enviado", entregado: "Entregado", leido: "Leído", fallido: "No se entregó" };

/** Las palomitas de WhatsApp: un reloj mientras sale, una (enviado), dos grises (entregado), dos azules (leído) o un aviso si falló. */
function Palomitas({ estado }: { estado: string }) {
  const nombre = ESTADO_SALIENTE[estado] ?? estado;
  if (estado === "enviando")
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" role="img" aria-label={nombre} className="flex-none">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 2" />
      </svg>
    );
  if (estado === "fallido")
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" role="img" aria-label={nombre} className="flex-none text-destructive">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5h.01" />
      </svg>
    );
  const doble = estado === "entregado" || estado === "leido";
  return (
    <svg width="17" height="11" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={nombre} className={`flex-none ${estado === "leido" ? "text-[var(--wa-leido)]" : ""}`}>
      <path d={doble ? "m1 6.5 3.2 3.2L11 2.5" : "m3 6.5 3.2 3.2L13 2.5"} />
      {doble && <path d="m7.5 9.2.5.5L14.8 2.5" />}
    </svg>
  );
}

/** La foto redonda de un chat: sus iniciales sobre su color. */
function Foto({ nombre, tam }: { nombre: string; tam: "lista" | "cabecera" | "ficha" }) {
  const medida = tam === "ficha" ? "h-[120px] w-[120px] text-[40px]" : tam === "cabecera" ? "h-10 w-10 text-[15px]" : "h-[49px] w-[49px] text-[17px]";
  return (
    <span aria-hidden="true" style={{ backgroundColor: colorFoto(nombre) }} className={`flex flex-none items-center justify-center rounded-full font-semibold text-white ${medida}`}>
      {iniciales(nombre)}
    </span>
  );
}

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
  // Una foto se abre en un visor sobre la misma página (centrada, con su texto y «Descargar»), no en una pestaña con la imagen suelta.
  const [ampliada, setAmpliada] = useState(false);
  const cerrarVisor = useCallback(() => setAmpliada(false), []);
  return (
    <>
      {m.conArchivo && m.tipo === "imagen" && (
        <>
          <button type="button" onClick={() => setAmpliada(true)} aria-label="Ver la foto en grande" className={`mb-1 block cursor-pointer ${anilloFoco}`}>
            <img src={src} alt={m.texto ? `Foto: ${m.texto}` : "Foto de la conversación"} loading="lazy" className="max-h-72 max-w-full rounded-md object-contain" />
          </button>
          <VisorImagen src={ampliada ? src : null} alt={m.texto ? `Foto: ${m.texto}` : "Foto de la conversación"} onClose={cerrarVisor} pie={m.texto} descargar={{ href: src, nombre: m.mediaNombre || "foto" }} />
        </>
      )}
      {m.conArchivo && m.tipo === "sticker" && <img src={src} alt="Sticker" loading="lazy" className="h-28 w-28 object-contain" />}
      {m.conArchivo && m.tipo === "audio" && <audio controls preload="none" src={src} className="max-w-full" />}
      {m.conArchivo && m.tipo === "video" && m.mediaNombre?.startsWith("gif-") && <video autoPlay loop muted playsInline preload="auto" src={src} aria-label="GIF" className="max-h-60 max-w-full rounded-md" />}
      {m.conArchivo && m.tipo === "video" && !m.mediaNombre?.startsWith("gif-") && <video controls preload="none" src={src} className="max-h-72 max-w-full rounded-md" />}
      {m.conArchivo && m.tipo === "documento" && (
        <a href={src} target="_blank" rel="noreferrer" className={`mb-1 flex items-center gap-2 rounded-md bg-[var(--wa-panel)] px-2 py-2 text-[13px] font-medium ${anilloFoco}`}>
          <span aria-hidden="true" className="flex h-8 w-7 flex-none items-center justify-center rounded bg-[var(--wa-acento)] text-[9px] font-bold text-[var(--wa-acento-texto)]">
            DOC
          </span>
          <span className="truncate">{m.mediaNombre ?? "Abrir documento"}</span>
        </a>
      )}
      {m.importado && !m.conArchivo && m.mediaNombre && (
        <span className="mb-1 block text-[13px] text-[var(--wa-sec)]">📎 {m.mediaNombre} (el archivo no se subió: vuelve a importar el chat con sus archivos)</span>
      )}
      {m.tipo === "reaccion" && <span className="text-[var(--wa-sec)]">Reaccionó </span>}
      {m.tipo === "ubicacion" && <span className="block text-xs font-medium text-[var(--wa-sec)]">Ubicación</span>}
      {m.texto ? (
        <span className="whitespace-pre-wrap break-words">{m.texto}</span>
      ) : (
        !m.conArchivo && !m.mediaNombre && m.tipo !== "reaccion" && <span className="text-[var(--wa-sec)]">{m.tipo === "otro" ? "Mensaje que WhatsApp no entregó a la plataforma. Pídele que lo mande de nuevo como mensaje normal." : `Mensaje que el sistema todavía no muestra (${m.tipo}).`}</span>
      )}
    </>
  );
}

/** Un botón redondo de ícono, como los de la barra de WhatsApp. */
const botonIcono = `flex h-10 w-10 flex-none items-center justify-center rounded-full text-[var(--wa-sec)] hover:bg-[var(--wa-hover)] disabled:opacity-50 ${anilloFoco}`;

/**
 * La bandeja de WhatsApp (26 oct 2026). **Paneles** (29 oct 2026, pedido de Hernán): uno por área; cada quien ve el suyo (`miArea`) y los
 * de las áreas de abajo (`areas`), que supervisa en silencio: abrir un chat de otro panel no lo marca leído (actions.ts) y para responder
 * hay que «Intervenir»; las notas privadas sí se dejan. Desde el 28 oct 2026 se ve y se usa como WhatsApp (pedido de Hernán; prototipo
 * https://claude.ai/artifact/RGtk9mxmht8nzneUX75ucx). Desde el 29 oct 2026 los paneles se ven **lado a lado** (bosquejo
 * https://claude.ai/artifact/2ijPiMamnVQpDmp7iTzqgE), con el buscador y los filtros arriba para todos; Atención, que ve uno solo, lo tiene a
 * todo lo ancho con «Esperando» y «La lleva». Antes: a la izquierda «Chats» con el buscador, los filtros (Sin responder, Mías, Todas y,
 * con más de un área, cada área) y la lista; al centro la conversación con burbujas, palomitas y la barra para escribir (Enter envía,
 * Mayús + Enter baja de línea), donde también se deja una nota privada; a la derecha, la ficha del dropshipper, que se abre y se cierra
 * tocando su nombre. Se refresca sola cada pocos segundos mientras está a la vista. Los colores propios viven en `.bandeja-wa` (globals.css).
 */
export function Bandeja({
  inicial,
  abrirInicial,
  escribe,
  miId,
  verTelefono = false,
  areas,
  miArea,
  estado360 = null,
}: {
  inicial: DatosBandeja;
  abrirInicial: string | null;
  escribe: boolean;
  miId: string;
  /** Puede usar «Mostrar número» (por ahora, administradores). */
  verTelefono?: boolean;
  /** Los paneles que ve la persona (las áreas, de la suya hacia abajo). */
  areas: AreaCrm[];
  /** Su panel: ahí lee y responde; en los demás supervisa. */
  miArea: AreaCrm;
  /** Solo para quien administra: qué datos de 360dialog tiene el servidor (si están, no su valor). Con la clave, puede registrar el webhook. */
  estado360?: { clave: boolean; sandbox: boolean; palabraSecreta: boolean } | null;
}) {
  const { mostrarToast } = useToast();
  // Las horas («14:05», «Ayer») y lo que queda de las 24 h dependen de la zona y del reloj de quien mira: el servidor no las sabe, así
  // que se dibujan recién en el navegador (si no, React avisa que el HTML no coincide, error #418).
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [datos, setDatos] = useState(inicial);
  const [filtro, setFiltro] = useState<Filtro>(abrirInicial ? "todas" : "sinResponder");
  const [numero, setNumero] = useState<string>("todos");
  const [buscar, setBuscar] = useState("");
  const [elegido, setElegido] = useState<string | null>(abrirInicial);
  const [chat, setChat] = useState<ChatAbierto | null>(null);
  /** La ventana «Importar chat»: con el chat abierto o, con `null`, para uno que todavía no existe en la bandeja. */
  const [importar, setImportar] = useState<{ conversacion: ConversacionVista | null } | null>(null);
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  /** La altura del chat antes de sumar mensajes viejos arriba, para dejar la vista donde estaba. */
  const alturaAntes = useRef<number | null>(null);
  const [modo, setModo] = useState<"responder" | "nota">("responder");
  const [borrador, setBorrador] = useState("");
  const [verPlantillas, setVerPlantillas] = useState(false);
  const [borrar, setBorrar] = useState<QueBorrar | null>(null);
  const [vincular, setVincular] = useState(false);
  // Mensajes rápidos del equipo (se ofrecen arriba del cuadro de texto) y el cambio de nombre de un contacto.
  const [rapidas, setRapidas] = useState<RespuestaRapida[]>(RAPIDAS_BASE);
  const [verRapidas, setVerRapidas] = useState(false);
  /** Si se está cambiando el nombre del contacto del chat abierto (en la cabecera de su ventana). */
  const [editandoNombre, setEditandoNombre] = useState<"cabecera" | null>(null);
  useEffect(() => {
    let vigente = true;
    listarRespuestasRapidas()
      .then((r) => {
        if (vigente && !("error" in r) && !r.falta) setRapidas(r.respuestas);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);
  // El archivo (foto, audio, video o documento) que se va a mandar por WhatsApp.
  const [archivo, setArchivo] = useState<File | null>(null);
  const inputArchivo = useRef<HTMLInputElement | null>(null);
  // Arrastrar una foto o una captura sobre el chat para mandarla (29 oct 2026). `capas` cuenta las entradas y salidas del arrastre por los
  // elementos de adentro, para no apagar el aviso «Suelta aquí» al pasar por encima de un mensaje.
  const [arrastrando, setArrastrando] = useState(false);
  const capas = useRef(0);
  // Menú del clic derecho sobre un chat de la lista: marcarlo como no leído (vuelve a pendiente de respuesta) o como leído.
  const [menuChat, setMenuChat] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuChatRef = useRef<HTMLDivElement | null>(null);
  const origenMenu = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!menuChat) return;
    const cerrar = () => setMenuChat(null);
    const fuera = (e: Event) => {
      if (!menuChatRef.current?.contains(e.target as Node)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cerrar();
        origenMenu.current?.focus();
      }
    };
    menuChatRef.current?.querySelector<HTMLElement>("button")?.focus();
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("contextmenu", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    window.addEventListener("blur", cerrar);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("contextmenu", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
      window.removeEventListener("blur", cerrar);
    };
  }, [menuChat]);
  // La vista previa de los últimos mensajes al pasar el cursor por un chat de la lista (solo con ratón y pantalla ancha).
  const [vista, setVista] = useState<{ id: string; top: number; left: number; mensajes: VistaPreviaMensaje[] | "cargando" | "error" } | null>(null);
  const temporizadorVista = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheVista = useRef(new Map<string, VistaPreviaMensaje[]>());
  const ocultarVistaPrevia = useCallback(() => {
    if (temporizadorVista.current) clearTimeout(temporizadorVista.current);
    temporizadorVista.current = null;
    setVista(null);
  }, []);
  const verVistaPrevia = useCallback((c: ConversacionVista, el: HTMLElement) => {
    if (typeof window === "undefined" || !window.matchMedia("(hover: hover) and (min-width: 1024px)").matches) return;
    if (temporizadorVista.current) clearTimeout(temporizadorVista.current);
    temporizadorVista.current = setTimeout(async () => {
      const r = el.getBoundingClientRect();
      const top = Math.max(8, Math.min(r.top, window.innerHeight - 336));
      // A la derecha del chat o, en la última columna (no cabe), a su izquierda.
      const left = r.right + 368 <= window.innerWidth ? r.right + 8 : Math.max(8, r.left - 368);
      const clave = `${c.id}|${c.ultimoMensajeEn}|${c.noLeidos}`;
      const guardado = cacheVista.current.get(clave);
      if (guardado) return setVista({ id: c.id, top, left, mensajes: guardado });
      setVista({ id: c.id, top, left, mensajes: "cargando" });
      const res = await vistaPreviaChat(c.id, Math.min(8, Math.max(3, c.noLeidos))).catch(() => ({ error: "x" }));
      if (!("error" in res)) cacheVista.current.set(clave, res.mensajes);
      setVista((v) => (v?.id === c.id ? { ...v, mensajes: "error" in res ? "error" : res.mensajes } : v));
    }, 350);
  }, []);
  useEffect(() => () => {
    if (temporizadorVista.current) clearTimeout(temporizadorVista.current);
  }, []);
  // La ventana del chat (29 oct 2026): si no caben la ficha y el chat lado a lado, se ve uno a la vez y se cambia con «Chat» / «Ficha».
  const [vistaAngosta, setVistaAngosta] = useState<"chat" | "ficha">("chat");
  const [enviando, empezar] = useTransition();
  const finRef = useRef<HTMLDivElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);

  // El refresco va por su propia ruta y no por una acción del servidor: las acciones van en fila y un refresco en curso hacía esperar al envío.
  // Trae solo los últimos mensajes del chat abierto y los une a los que ya hay. Si dos refrescos se cruzan, vale el último que se pidió.
  const refrescar = useCallback(async (id: string | null) => {
    const n = ++vueltas.pedidas;
    const r = await fetch("/api/whatsapp/bandeja", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat: id }), cache: "no-store" }).catch(() => null);
    const json = r?.ok ? ((await r.json().catch(() => null)) as Refresco | null) : null;
    if (!json || n < vueltas.aplicada) return;
    vueltas.aplicada = n;
    setDatos(json.bandeja);
    const c = json.chat;
    if (c)
      setChat((antes) =>
        antes && antes.id !== c.id
          ? antes
          : antes
            ? { ...antes, dropshipper: c.dropshipper, mensajes: unirMensajes(antes.mensajes, c.mensajes) }
            : { id: c.id, mensajes: c.mensajes, dropshipper: c.dropshipper, hayAnteriores: true },
      );
  }, []);
  const elegidoRef = useRef(elegido);
  useEffect(() => {
    elegidoRef.current = elegido;
  }, [elegido]);

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

  // La ficha del CRM del dropshipper del chat abierto (29 oct 2026): se pide al abrirlo y otra vez cuando algo de ella se guarda.
  const [fichaCrm, setFichaCrm] = useState<{ id: string; datos: FichaCrmChat | "error" } | null>(null);
  const [versionCrm, setVersionCrm] = useState(0);
  const idDropshipper = (chat && chat.id === elegido ? chat.dropshipper?.id : null) ?? null;
  useEffect(() => {
    if (!idDropshipper) return;
    let vigente = true;
    fichaCrmDelChat(idDropshipper)
      .then((r) => vigente && setFichaCrm({ id: idDropshipper, datos: "error" in r ? "error" : r }))
      .catch(() => vigente && setFichaCrm({ id: idDropshipper, datos: "error" }));
    return () => {
      vigente = false;
    };
  }, [idDropshipper, versionCrm]);
  const fichaDelChat = idDropshipper ? (fichaCrm?.id === idDropshipper ? fichaCrm.datos : "cargando") : null;

  // Aviso en tiempo real (29 oct 2026): cuando llega o sale un mensaje, el servidor avisa y la bandeja se actualiza al momento. El aviso no
  // trae datos; se piden con los permisos de siempre. Varios avisos seguidos se juntan en un solo refresco.
  const [enVivo, setEnVivo] = useState(false);
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | null = null;
    const canal = supabase
      .channel(CANAL_BANDEJA)
      .on("broadcast", { event: EVENTO_NOVEDAD }, () => {
        if (espera || document.visibilityState !== "visible") return;
        espera = setTimeout(() => {
          espera = null;
          void refrescar(elegidoRef.current);
        }, 250);
      })
      .subscribe((estado) => setEnVivo(estado === "SUBSCRIBED"));
    return () => {
      if (espera) clearTimeout(espera);
      void supabase.removeChannel(canal);
    };
  }, [refrescar]);

  // Se refresca sola mientras la pestaña está a la vista (con el aviso conectado, solo de respaldo), y al volver a ella, en el momento.
  useEffect(() => {
    const t = setInterval(
      () => {
        if (document.visibilityState === "visible") void refrescar(elegido);
      },
      enVivo ? REFRESCO_RESPALDO_MS : REFRESCO_MS,
    );
    const alVolver = () => {
      if (document.visibilityState === "visible") void refrescar(elegido);
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [elegido, refrescar, enVivo]);

  // Al abrir el chat o con un mensaje nuevo, se baja al final; al sumar mensajes viejos arriba, la vista se queda donde estaba.
  const ultimoId = chat?.mensajes.at(-1)?.id;
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [ultimoId, chat?.id]);
  const cantidadMensajes = chat?.mensajes.length ?? 0;
  useLayoutEffect(() => {
    const caja = chatRef.current;
    if (caja && alturaAntes.current !== null) caja.scrollTop += caja.scrollHeight - alturaAntes.current;
    alturaAntes.current = null;
  }, [cantidadMensajes]);

  async function verAnteriores() {
    if (!chat?.mensajes.length || cargandoAnteriores) return;
    const id = chat.id;
    setCargandoAnteriores(true);
    const r = await mensajesAnteriores(id, chat.mensajes[0].momento).catch(() => ({ error: "No se pudieron traer. Inténtalo de nuevo." }));
    setCargandoAnteriores(false);
    if ("error" in r) {
      mostrarToast(r.error, "destructive");
      return;
    }
    alturaAntes.current = chatRef.current?.scrollHeight ?? null;
    setChat((antes) => (antes && antes.id === id ? { ...antes, mensajes: unirMensajes(r.mensajes, antes.mensajes), hayAnteriores: r.hayAnteriores } : antes));
  }

  // El campo crece con lo escrito, hasta unas seis líneas (como en WhatsApp).
  useEffect(() => {
    const t = textoRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 144)}px`;
  }, [borrador]);

  const numeroDe = useMemo(() => new Map(datos.numeros.map((n) => [n.id, n])), [datos.numeros]);
  const delNumero = useMemo(() => datos.conversaciones.filter((c) => numero === "todos" || c.numeroId === numero), [datos.conversaciones, numero]);
  // Los filtros cuentan los chats de todos los paneles que se ven.
  const opciones: { id: Filtro; texto: string; cuenta: number }[] = [
    { id: "sinResponder", texto: "Sin responder", cuenta: delNumero.filter(sinResponder).length },
    { id: "mias", texto: "Mías", cuenta: delNumero.filter((c) => c.asignadaAId === miId).length },
    { id: "todas", texto: "Todas", cuenta: delNumero.length },
  ];
  // Una lista por panel (29 oct 2026): los paneles se ven lado a lado, cada uno con sus chats según el filtro y la búsqueda.
  const listas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return new Map(
      areas.map((a) => [
        a,
        delNumero
          .filter((c) => c.area === a)
          .filter(
            (c) =>
              // El chat abierto se queda en la lista aunque ya no cumpla el filtro (al leerlo deja de estar «Sin responder»), como en WhatsApp.
              c.id === elegido ||
              (filtro === "sinResponder" ? sinResponder(c) : filtro === "mias" ? c.asignadaAId === miId : true),
          )
          .filter((c) => !q || [c.nombre, c.nombrePerfil, c.codigo, ...c.tiendas].some((x) => x?.toLowerCase().includes(q))),
      ]),
    );
  }, [areas, delNumero, filtro, buscar, miId, elegido]);

  const sel = datos.conversaciones.find((c) => c.id === elegido) ?? null;
  // La lista del panel del chat abierto: las flechas de su ventana pasan al anterior o al siguiente de esa columna.
  const lista = sel ? (listas.get(sel.area) ?? []) : [];
  const ventana = sel && enNavegador ? textoVentana(sel.ultimoEntranteEn) : null;
  // Supervisión: un chat de otro panel se mira sin dejar rastro; para responderle al dropshipper hay que «Intervenir» (queda a su cargo).
  const supervisando = !!sel && sel.area !== miArea;
  const mirando = supervisando && sel?.asignadaAId !== miId;
  const esNota = modo === "nota" || mirando;
  const bloqueado = !escribe || (!esNota && !ventana);
  const mensajes = chat && sel && chat.id === sel.id ? chat.mensajes : null;
  // Las reacciones no son mensajes sueltos: van sobre el mensaje al que se reaccionó, como en WhatsApp (29 oct 2026).
  const conReacciones = mensajes ? agruparReacciones(mensajes) : null;
  const cambiosDeArea = (mensajes ?? []).filter((m) => m.direccion === "nota" && ES_CAMBIO_DE_AREA.test(m.texto ?? ""));

  /** Escribe un emoji donde está el cursor (o al final) y deja el cursor justo después. */
  function insertarEmoji(emoji: string) {
    const campo = textoRef.current;
    const desde = campo?.selectionStart ?? borrador.length;
    const hasta = campo?.selectionEnd ?? borrador.length;
    setBorrador(borrador.slice(0, desde) + emoji + borrador.slice(hasta));
    requestAnimationFrame(() => {
      campo?.focus();
      campo?.setSelectionRange(desde + emoji.length, desde + emoji.length);
    });
  }

  /**
   * Un archivo soltado sobre el chat: abre la misma ventana que el clip (vista previa y texto al pie). Si no se le puede escribir, dice por qué;
   * con varios, va el primero (WhatsApp manda uno por mensaje).
   */
  function soltarArchivos(lista: FileList) {
    const f = lista[0];
    if (!f || !sel) return;
    if (mirando) return mostrarToast("Estás supervisando este chat: para mandarle un archivo, toca «Intervenir».", "destructive");
    if (!escribe) return mostrarToast("No tienes permiso para escribir en este chat.", "destructive");
    if (!ventana) return mostrarToast("Pasaron más de 24 h desde su último mensaje: por WhatsApp solo se le puede escribir con una plantilla aprobada.", "destructive");
    if (lista.length > 1) mostrarToast("Se manda un archivo a la vez: va el primero.");
    setModo("responder");
    setArchivo(f);
  }
  const traeArchivos = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  function mandar() {
    if (!sel || !borrador.trim() || bloqueado) return;
    enviarTexto(sel.id, borrador, esNota);
    setBorrador("");
  }

  /**
   * Manda un texto (o guarda una nota) mostrándolo **al momento** en el chat con su reloj, como WhatsApp (29 oct 2026): antes no se veía hasta
   * que el servidor respondía y la bandeja se recargaba. Cuando responde, se cambia por el guardado; si falla, queda en rojo con «Reintentar».
   * `reemplaza`: el que falló y se reintenta.
   */
  function enviarTexto(chatId: string, texto: string, nota: boolean, reemplaza?: string) {
    const local: MensajeVista = {
      id: idLocal(),
      direccion: nota ? "nota" : "saliente",
      tipo: "texto",
      texto: texto.trim(),
      mediaNombre: null,
      conArchivo: false,
      estado: "enviando",
      error: null,
      autor: null,
      autorCargo: null,
      momento: ahoraIso(),
      importado: false,
      eliminadoEnWhatsapp: false,
      borradoPendiente: false,
    };
    setChat((c) => (c && c.id === chatId ? { ...c, mensajes: [...c.mensajes.filter((m) => m.id !== reemplaza), local] } : c));
    void (nota ? notaWhatsapp(chatId, texto) : enviarWhatsapp(chatId, texto))
      .catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }))
      .then((r) => {
        if ("error" in r) mostrarToast(r.error, "destructive");
        setChat((c) => {
          if (!c || c.id !== chatId) return c;
          if ("error" in r) return { ...c, mensajes: c.mensajes.map((m) => (m.id === local.id ? { ...m, estado: "fallido", error: r.error } : m)) };
          // El refresco puede haber traído ya el guardado: se une por su id, sin repetirlo.
          return { ...c, mensajes: unirMensajes(c.mensajes.filter((m) => m.id !== local.id), [{ ...local, id: r.mensajeId, momento: r.momento, estado: "enviado" }]) };
        });
        if (!("error" in r)) void refrescar(chatId);
      });
  }

  // Las etiquetas de los chats, como en ClickUp (migración 0185): se ven al momento y vuelven a como estaban si el servidor no las guarda.
  const [etiquetando, setEtiquetando] = useState<string | null>(null);
  const anclaEtiquetas = useRef<HTMLElement | null>(null);
  const manejoEtiquetas: ManejoEtiquetas = useMemo(() => {
    const ponerEtiquetas = (id: string, etiquetas: string[]) => setDatos((d) => ({ ...d, conversaciones: d.conversaciones.map((x) => (x.id === id ? { ...x, etiquetas } : x)) }));
    return {
      todas: [...new Set([...Object.keys(datos.colores ?? {}), ...datos.conversaciones.flatMap((c) => c.etiquetas ?? [])])],
      colores: datos.colores ?? {},
      cambiar: (id, etiquetas) => {
        const antes = datos.conversaciones.find((c) => c.id === id)?.etiquetas ?? [];
        ponerEtiquetas(id, etiquetas);
        void guardarEtiquetasChat(id, etiquetas)
          .then((r) => ("error" in r ? (ponerEtiquetas(id, antes), mostrarToast(r.error, "destructive")) : ponerEtiquetas(id, r.etiquetas)))
          .catch(() => {
            ponerEtiquetas(id, antes);
            mostrarToast("No se pudieron guardar las etiquetas.", "destructive");
          });
      },
      cambiarColor: (nombre, color) => {
        const antes = datos.colores?.[nombre];
        const poner = (c: string | undefined) => setDatos((d) => ({ ...d, colores: Object.fromEntries(Object.entries({ ...d.colores, [nombre]: c }).filter(([, v]) => v)) as Record<string, string> }));
        poner(color);
        void guardarColorEtiquetaChat(nombre, color)
          .then((r) => {
            if ("error" in r) {
              poner(antes);
              mostrarToast(r.error, "destructive");
            }
          })
          .catch(() => {
            poner(antes);
            mostrarToast("No se pudo guardar el color.", "destructive");
          });
      },
    };
  }, [datos.colores, datos.conversaciones, mostrarToast]);

  /** «Etiquetas» del clic derecho: el selector se abre junto al chat de la lista. */
  function etiquetarDesdeLista(id: string) {
    anclaEtiquetas.current = origenMenu.current;
    setMenuChat(null);
    setEtiquetando(id);
  }

  /** Marca un chat como leído o no leído. Un chat abierto se cierra al marcarlo no leído (si no, seguiría contando como leído al refrescar). */
  function marcarLeido(c: ConversacionVista, leido: boolean) {
    setMenuChat(null);
    if (!leido && c.id === elegido) setElegido(null);
    setDatos((d) => ({ ...d, conversaciones: d.conversaciones.map((x) => (x.id === c.id ? (leido ? { ...x, noLeidos: 0 } : { ...x, noLeidos: Math.max(1, x.noLeidos), estado: "abierta" as const }) : x)) }));
    void marcarChatLeido(c.id, leido)
      .then((r) => {
        if ("error" in r) mostrarToast(r.error, "destructive");
        else mostrarToast(leido ? "Marcado como leído." : "Marcado como no leído: vuelve a estar pendiente de respuesta.");
        return refrescar(null);
      })
      .catch(() => mostrarToast("No se pudo marcar.", "destructive"));
  }

  /** Pone un mensaje rápido en el cuadro de texto (no lo envía: se puede cambiar antes) y anota que se usó. */
  function elegirRapida(r: RespuestaRapida) {
    setBorrador(r.texto);
    textoRef.current?.focus();
    if (!r.id.startsWith("base-")) {
      setRapidas((l) => l.map((x) => (x.id === r.id ? { ...x, usos: x.usos + 1 } : x)));
      void usarRespuestaRapida(r.id);
    }
  }

  /** Guarda un texto (lo escrito o un mensaje ya mandado) como mensaje rápido. */
  function guardarComoRapida(texto: string) {
    const v = validarRapida(texto);
    if ("error" in v) return mostrarToast(v.error, "destructive");
    if (yaEsRapida(rapidas, v.texto)) return mostrarToast("Ese mensaje rápido ya existe.");
    void guardarRespuestaRapida(v.texto)
      .then((r) => {
        if ("error" in r) return mostrarToast(r.error, "destructive");
        setRapidas((l) => [...l.filter((x) => !x.id.startsWith("base-")), r.respuesta]);
        mostrarToast("Guardado como mensaje rápido.");
      })
      .catch(() => mostrarToast("No se pudo guardar.", "destructive"));
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
    const queda = areas.includes(destino);
    accion(() => pasarConversacionDeArea(sel.id, destino), queda ? `Chat pasado a ${areaChat(destino).etiqueta}.` : `Chat pasado a ${areaChat(destino).etiqueta}. Ya no lo verás en tu bandeja.`);
    // Si sigue a la vista, aparece en la columna de su nuevo panel; si no, se cierra.
    if (!queda) setElegido(null);
  }

  /** Abre un chat en su ventana: queda leído (en el panel propio; supervisando, no) y se ve el chat primero. */
  function abrirChat(c: ConversacionVista) {
    ocultarVistaPrevia();
    setElegido(c.id);
    setChat((x) => (x?.id === c.id ? x : null));
    setVistaAngosta("chat");
    setEditandoNombre(null);
    // Al abrirla queda leída (el servidor la marca en `abrirConversacion`), solo en el panel propio: supervisando, no.
    if (c.area === miArea) setDatos((d) => ({ ...d, conversaciones: d.conversaciones.map((x) => (x.id === c.id ? { ...x, noLeidos: 0 } : x)) }));
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

  /**
   * Un chat en la lista de su panel. `ancha`: el panel ocupa todo el ancho (Atención, que ve uno solo): suma «Esperando» (cuánto lleva sin
   * respuesta) y «La lleva».
   */
  function filaChat(c: ConversacionVista, ancha: boolean) {
    const actual = c.id === elegido;
    // El número solo se dice si el chat llegó por el de otra área: el de su panel ya está en la cabecera de la columna.
    const otroNumero = datos.numeros.length > 1 && numeroDe.get(c.numeroId)?.area !== c.area ? (numeroDe.get(c.numeroId)?.nombre ?? null) : null;
    const datosFila = (
      <>
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[16px]">{c.nombre}</span>
          <span className={`flex-none text-xs tabular-nums ${c.noLeidos ? "font-semibold text-[var(--wa-acento)]" : "text-[var(--wa-sec)]"}`}>{enNavegador ? horaCorta(c.ultimoMensajeEn) : ""}</span>
        </span>
        <span className="flex items-center gap-1.5 text-sm text-[var(--wa-sec)]">
          {c.ultimoDe === "saliente" && <Palomitas estado="entregado" />}
          {c.ultimoDe === "nota" && <span className="flex-none font-medium text-[var(--wa-nota-acento)]">Nota:</span>}
          <span className={`min-w-0 flex-1 truncate ${c.noLeidos ? "font-medium text-[var(--wa-texto)]" : ""}`}>{c.ultimoTexto ?? ""}</span>
          {c.noLeidos > 0 && (
            <span className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-[var(--wa-acento)] px-1.5 text-xs font-semibold text-[var(--wa-acento-texto)] tabular-nums">
              {c.noLeidos}
              <span className="sr-only"> sin leer</span>
            </span>
          )}
        </span>
        {(!c.dropshipperId || c.estado === "resuelta" || c.asignadaA || c.borradaEnApp || otroNumero || c.etiquetas.length > 0) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11.5px] text-[var(--wa-sec)]">
            {!c.dropshipperId && <span className="rounded-full bg-warning-soft px-2 py-px font-medium text-warning">No está en el CRM</span>}
            {c.borradaEnApp && <span className="rounded-full bg-warning-soft px-2 py-px font-medium text-warning">Borrado en la app</span>}
            {c.estado === "resuelta" && <span className="rounded-full bg-success-soft px-2 py-px font-medium text-success">Resuelta</span>}
            <PastillasEtiquetas etiquetas={c.etiquetas} colores={manejoEtiquetas.colores} />
            {otroNumero && <span>Por {otroNumero}</span>}
            {c.asignadaA && <span className={ancha ? "lg:hidden" : undefined}>La lleva {c.asignadaA}</span>}
          </span>
        )}
      </>
    );
    const espera = enNavegador && sinResponder(c) ? esperaDe(c.ultimoEntranteEn) : null;
    return (
      <li
        key={c.id}
        onMouseEnter={(e) => c.id !== elegido && verVistaPrevia(c, e.currentTarget)}
        onMouseLeave={ocultarVistaPrevia}
        onContextMenu={(e) => {
          e.preventDefault();
          ocultarVistaPrevia();
          origenMenu.current = e.currentTarget.querySelector("button");
          // Con el teclado (tecla de menú o Mayús + F10) no hay posición del cursor: el menú sale junto al chat.
          const r = e.currentTarget.getBoundingClientRect();
          const conRaton = e.clientX !== 0 || e.clientY !== 0;
          setMenuChat({ id: c.id, x: Math.min(conRaton ? e.clientX : r.left + 40, window.innerWidth - 230), y: Math.min(conRaton ? e.clientY : r.bottom - 8, window.innerHeight - 70) });
        }}
      >
        <button
          type="button"
          onClick={() => abrirChat(c)}
          aria-current={actual ? "true" : undefined}
          onFocus={(e) => !actual && verVistaPrevia(c, e.currentTarget)}
          onBlur={ocultarVistaPrevia}
          className={`flex w-full items-center gap-3 pl-3.5 text-left ${actual ? "bg-[var(--wa-sel)]" : "hover:bg-[var(--wa-hover)]"} ${anilloFoco}`}
        >
          <Foto nombre={c.nombre} tam="lista" />
          {ancha ? (
            <span className="flex min-w-0 flex-1 items-center gap-4 border-b border-[var(--wa-borde)] py-3 pr-3.5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">{datosFila}</span>
              <span className={`hidden w-[140px] flex-none items-center gap-1.5 text-[13px] font-semibold tabular-nums lg:flex ${espera ? espera.clase : "font-normal text-[var(--wa-sec)]"}`}>
                {espera && <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full bg-current" />}
                {espera ? espera.texto : c.estado === "resuelta" ? "Resuelta" : "Respondido"}
              </span>
              <span className="hidden w-[160px] flex-none truncate text-[13px] text-[var(--wa-sec)] lg:block">{c.asignadaA ?? "Sin asignar"}</span>
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 border-b border-[var(--wa-borde)] py-3 pr-3.5">{datosFila}</span>
          )}
        </button>
        {vista?.id === c.id && <VistaPreviaChat nombre={c.nombre} etiquetas={<PastillasEtiquetas etiquetas={c.etiquetas} colores={manejoEtiquetas.colores} />} mensajes={vista.mensajes} noLeidos={c.noLeidos} top={vista.top} left={vista.left} />}
      </li>
    );
  }

  const verDropshipper = chat?.id === sel?.id ? chat?.dropshipper : null;
  // Las flechas de la ventana pasan al chat anterior o siguiente de su columna tal como se ve (filtro y búsqueda).
  const posicion = sel ? lista.findIndex((c) => c.id === sel.id) : -1;
  const chatAnterior = posicion > 0 ? lista[posicion - 1] : null;
  const chatSiguiente = posicion >= 0 && posicion < lista.length - 1 ? lista[posicion + 1] : null;

  // Los botones del chat que abren la fila de la ficha: Intervenir (supervisando) o Tomar / Soltar y Marcar resuelta / Reabrir.
  const accionesChat =
    sel && escribe ? (
      mirando ? (
        <button
          type="button"
          disabled={enviando}
          className={claseBotonFichaPrincipal}
          onClick={() => accion(() => intervenirConversacion(sel.id), "Intervienes en este chat: ya puedes responderle.")}
          title="Tomar el chat para responderle al dropshipper. Queda una nota en el chat."
        >
          <ChatIcon className="h-4 w-4" />
          Intervenir
        </button>
      ) : (
        <>
          {sel.asignadaAId === miId ? (
            <button type="button" disabled={enviando} className={claseBotonFicha} onClick={() => accion(() => tomarConversacion(sel.id, true), "Soltaste la conversación.")}>
              <PersonaIcon className="h-4 w-4" />
              Soltar
            </button>
          ) : (
            <button
              type="button"
              disabled={enviando}
              className={claseBotonFichaPrincipal}
              title={sel.asignadaA ? `La lleva ${sel.asignadaA}` : "Que quede a tu cargo"}
              onClick={() => accion(() => tomarConversacion(sel.id), "La conversación quedó a tu cargo.")}
            >
              <PersonaIcon className="h-4 w-4" />
              Tomar
            </button>
          )}
          {sel.estado === "abierta" ? (
            <button type="button" disabled={enviando} className={claseBotonFicha} onClick={() => accion(() => cambiarEstadoConversacion(sel.id, "resuelta"), "Marcada resuelta. Si vuelve a escribir, se reabre sola.")}>
              <CheckIcon className="h-4 w-4" />
              Resuelta
            </button>
          ) : (
            <button type="button" disabled={enviando} className={claseBotonFicha} onClick={() => accion(() => cambiarEstadoConversacion(sel.id, "abierta"), "Conversación reabierta.")}>
              <ReactivarIcon className="h-4 w-4" />
              Reabrir
            </button>
          )}
        </>
      )
    ) : null;

  // «Más»: lo que antes estaba en la cabecera del chat y en la ficha del costado.
  const opcionesMas: OpcionMas[] = !sel
    ? []
    : [
        { texto: "Marcar como no leído", alPulsar: () => marcarLeido(sel, false) },
        ...(escribe && !mirando
          ? [
              ...AREAS_CHAT.filter((a) => a.valor !== sel.area).map((a) => ({ texto: `Pasar a ${a.etiqueta}`, alPulsar: () => pasarA(a.valor) })),
              { texto: "Importar chat del celular", alPulsar: () => setImportar({ conversacion: sel }) },
              {
                texto: sel.borradaEnApp ? "Quitar marca de borrado" : "Marcar borrado en la app",
                alPulsar: () => accion(() => marcarChatBorradoEnApp(sel.id, !sel.borradaEnApp), sel.borradaEnApp ? "Quitaste la marca." : "Marcado: se borró en la app de WhatsApp Business. Aquí se conserva todo."),
              },
              ...(sel.borradoPendiente ? [] : [{ texto: "Pedir borrar el chat", alPulsar: () => setBorrar({ tipo: "chat" }) }]),
            ]
          : []),
        ...(verDropshipper
          ? [{ texto: "Abrir su ficha en el CRM", href: `/crm-dropshippers?abrir=${verDropshipper.id}` }, ...(escribe ? [{ texto: "No es este dropshipper", alPulsar: () => setVincular(true) }] : [])]
          : escribe && !sel.dropshipperId
            ? [{ texto: "Vincular a un dropshipper", alPulsar: () => setVincular(true) }]
            : []),
      ];

  return (
    <div className="bandeja-wa flex min-h-[640px] flex-col gap-3 text-[var(--wa-texto)] lg:h-[calc(100vh-200px)]">
      {/* ===== Arriba, para todos los paneles: buscar, número, filtros e «Importar chat» ===== */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-10 min-w-0 flex-[1_1_260px] items-center gap-3 rounded-lg bg-[var(--wa-panel)] px-3.5 text-[var(--wa-sec)] focus-within:ring-2 focus-within:ring-[var(--wa-acento)] sm:max-w-md">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="sr-only">Buscar conversación</span>
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder={areas.length > 1 ? "Buscar en los paneles: nombre, código o tienda" : "Buscar nombre, código o tienda"}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--wa-texto)] outline-none placeholder:text-[var(--wa-sec)]"
          />
        </label>
        {datos.numeros.length > 1 && (
          <label className="flex">
            <span className="sr-only">Número de la empresa</span>
            <select value={numero} onChange={(e) => setNumero(e.target.value)} className={`h-10 max-w-[200px] rounded-lg border-0 bg-[var(--wa-panel)] px-2 text-[13px] ${anilloFoco}`}>
              <option value="todos">Todos los números</option>
              {datos.numeros.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <div role="group" aria-label="Qué conversaciones ver" className="flex flex-wrap gap-1.5">
          {opciones.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={filtro === o.id}
              onClick={() => setFiltro(o.id)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] ${
                filtro === o.id ? "bg-[var(--wa-acento-suave)] font-semibold text-[var(--wa-acento-suave-texto)]" : "bg-[var(--wa-panel)] text-[var(--wa-sec)] hover:bg-[var(--wa-borde)]"
              } ${anilloFoco}`}
            >
              {o.texto}
              {o.cuenta > 0 && <span className="tabular-nums">{o.cuenta}</span>}
            </button>
          ))}
        </div>
        {escribe && (
          <button
            type="button"
            onClick={() => setImportar({ conversacion: null })}
            title="Importar un chat exportado desde el celular"
            className={`ml-auto inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--wa-borde)] bg-[var(--wa-fondo)] px-3.5 text-[13px] font-medium text-[var(--wa-sec)] hover:bg-[var(--wa-hover)] ${anilloFoco}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            Importar chat
          </button>
        )}
      </div>

      {/* ===== Los paneles, lado a lado (29 oct 2026): Atención, que solo ve el suyo, lo tiene a todo lo ancho ===== */}
      <div className={`grid min-h-0 flex-1 grid-cols-1 gap-3 ${COLUMNAS_PANELES[areas.length] ?? ""}`}>
        {areas.map((a) => {
          const chats = listas.get(a) ?? [];
          const pendientes = delNumero.filter((c) => c.area === a && sinResponder(c)).length;
          const numerosDelArea = datos.numeros.filter((n) => n.area === a).map((n) => n.nombre);
          const ancha = areas.length === 1;
          return (
            <section
              key={a}
              aria-label={`Panel de ${areaChat(a).etiqueta}`}
              className="flex max-h-[75vh] min-h-[360px] flex-col overflow-hidden rounded-[14px] border border-[var(--wa-borde)] bg-[var(--wa-fondo)] lg:max-h-none lg:min-h-0"
            >
              <div className="flex items-start gap-2.5 border-b border-[var(--wa-borde)] px-4 pt-3.5 pb-3">
                <span aria-hidden="true" className={`mt-[7px] h-2.5 w-2.5 flex-none rounded-full bg-current ${colorDeArea(a)}`} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <h2 className="m-0 text-[17px] font-bold">
                    {areaChat(a).etiqueta}
                    {a === miArea && areas.length > 1 && <span className="ml-1.5 text-xs font-normal text-[var(--wa-sec)]">(tuyo)</span>}
                  </h2>
                  <span className="truncate text-[12.5px] text-[var(--wa-sec)]">
                    {numerosDelArea.length ? numerosDelArea.join(" · ") : a === "direccion" ? "Sus chats propios, que nadie más ve" : "Sin número propio"}
                  </span>
                </div>
                {pendientes > 0 && (
                  <span className="flex h-6 flex-none items-center rounded-full bg-[var(--wa-acento)] px-2.5 text-xs font-semibold text-[var(--wa-acento-texto)] tabular-nums">{pendientes} sin responder</span>
                )}
              </div>
              {ancha && chats.length > 0 && (
                <div aria-hidden="true" className="hidden items-center gap-4 border-b border-[var(--wa-borde)] bg-[var(--wa-panel)] py-2 pr-3.5 pl-[76px] text-[11.5px] font-semibold tracking-wide text-[var(--wa-sec)] uppercase lg:flex">
                  <span className="flex-1">Chat</span>
                  <span className="w-[140px] flex-none">Esperando</span>
                  <span className="w-[160px] flex-none">La lleva</span>
                </div>
              )}
              <ul className="m-0 flex-1 list-none overflow-y-auto p-0">
                {chats.map((c) => filaChat(c, ancha))}
                {!chats.length && <li className="px-4 py-10 text-center text-sm text-[var(--wa-sec)]">{filtro === "sinResponder" ? "Nada sin responder." : "No hay conversaciones con este filtro."}</li>}
              </ul>
              {a !== miArea && <p className="m-0 border-t border-[var(--wa-borde)] bg-[var(--wa-panel)] px-4 py-2 text-xs text-[var(--wa-sec)]">Supervisión: lo que abras aquí no se marca leído</p>}
            </section>
          );
        })}
      </div>

      {/* ===== El chat abierto, en su ventana: la ficha del dropshipper a la izquierda y el chat a la derecha (29 oct 2026) ===== */}
      {sel && (
        <Ventana
          abierto
          alCerrar={() => setElegido(null)}
          lado="centro"
          ancho="xl"
          masAncha
          titulo={
            <span className="bandeja-wa contents">
              <span className="flex min-w-0 items-center gap-3">
                <Foto nombre={sel.nombre} tam="cabecera" />
                <span className="flex min-w-0 flex-col">
                  {editandoNombre ? (
                    <EditorNombreContacto
                      key={sel.id}
                      conversacionId={sel.id}
                      nombreActual={sel.nombre}
                      personalizado={sel.nombrePersonalizado}
                      alCerrar={() => setEditandoNombre(null)}
                      alListo={(mensaje) => {
                        setEditandoNombre(null);
                        mostrarToast(mensaje);
                        void refrescar(sel.id);
                      }}
                    />
                  ) : (
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="min-w-0 text-lg leading-tight font-semibold [overflow-wrap:anywhere]">{sel.nombre}</span>
                      {escribe && (
                        <button type="button" onClick={() => setEditandoNombre("cabecera")} aria-label="Cambiar el nombre del contacto" title="Cambiar el nombre" className={`${botonIcono} !h-8 !w-8`}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                          </svg>
                        </button>
                      )}
                    </span>
                  )}
                  <span className="flex min-w-0 items-center gap-1 truncate text-xs font-normal text-muted-foreground tabular-nums">
                    {[
                      sel.codigo,
                      sel.nombrePerfil && sel.nombrePerfil !== sel.nombre ? `«${sel.nombrePerfil}» en WhatsApp` : null,
                      numeroDe.get(sel.numeroId)?.nombre,
                      sel.asignadaA ? `la lleva ${sel.asignadaA}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    <MostrarTelefono tipo="conversacion" id={sel.id} puede={verTelefono} />
                  </span>
                </span>
              </span>
              <EtiquetaArea area={sel.area} />
              {sel.estado === "resuelta" && <span className="rounded-full bg-success-soft px-2 py-px text-[11.5px] font-medium text-success">Resuelta</span>}
              {sel.borradaEnApp && <span className="rounded-full bg-warning-soft px-2 py-px text-[11.5px] font-medium text-warning">Borrado en la app</span>}
              {sel.borradoPendiente && (
                <Link href="/crm-dropshippers/borrados" className={`rounded-full bg-azul-soft px-2 py-px text-[11.5px] font-medium text-azul hover:underline ${anilloFoco}`}>
                  Borrado esperando autorización
                </Link>
              )}
            </span>
          }
          navegacion={
            <>
              <BotonNavegar texto="Chat anterior" icono={FlechaArribaIcon} activo={!!chatAnterior} alHacerClic={() => chatAnterior && abrirChat(chatAnterior)} />
              <BotonNavegar texto="Chat siguiente" icono={FlechaAbajoIcon} activo={!!chatSiguiente} alHacerClic={() => chatSiguiente && abrirChat(chatSiguiente)} />
            </>
          }
        >
          <div className="bandeja-wa @container flex min-h-0 flex-1 flex-col bg-[var(--wa-fondo)] text-[var(--wa-texto)]">
            {/* Si no caben lado a lado, se ve uno a la vez. */}
            <div role="group" aria-label="Qué ver" className="flex gap-1 border-b border-[var(--wa-borde)] bg-[var(--wa-panel)] p-1.5 @4xl:hidden">
              {(["chat", "ficha"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vistaAngosta === v}
                  onClick={() => setVistaAngosta(v)}
                  className={`min-h-8 flex-1 rounded-md text-[13px] ${vistaAngosta === v ? "bg-[var(--wa-fondo)] font-semibold shadow-[0_1px_0.5px_var(--wa-sombra)]" : "text-[var(--wa-sec)]"} ${anilloFoco}`}
                >
                  {v === "chat" ? "Chat" : "Ficha del dropshipper"}
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-1">
              <div className={`${vistaAngosta === "ficha" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col @4xl:flex`}>
                <FichaDelChat
                  sel={sel}
                  dropshipper={verDropshipper ?? null}
                  ficha={fichaDelChat}
                  alGuardarCrm={() => setVersionCrm((v) => v + 1)}
                  escribe={escribe}
                  mirando={mirando}
                  accionesChat={accionesChat}
                  etiquetas={<EtiquetasChat key={sel.id} conversacionId={sel.id} etiquetas={sel.etiquetas} manejo={manejoEtiquetas} escribe={escribe} />}
                  opcionesMas={opcionesMas}
                  areaDelChat={
                    <Bloque titulo="Área del chat">
                      <span className="self-start">
                        <EtiquetaArea area={sel.area} />
                      </span>
                      <div className="flex flex-col gap-1 text-[12.5px] text-[var(--wa-sec)]">
                        {cambiosDeArea.length ? cambiosDeArea.map((m) => <span key={m.id}>{`${m.texto} · ${horaCorta(m.momento)}`}</span>) : <span>Entró a {areaChat(sel.area).etiqueta} con su primer mensaje.</span>}
                      </div>
                    </Bloque>
                  }
                  respondieron={quienesRespondieron(mensajes ?? [])}
                  versionEquipo={`${(mensajes ?? []).filter((m) => m.direccion !== "entrante").length}|${sel.nombrePersonalizado ?? ""}|${sel.dropshipperId ?? ""}|${sel.area}|${sel.estado}|${sel.asignadaA ?? ""}`}
                  alAbrirVincular={() => setVincular(true)}
                  alVinculado={(mensaje) => {
                    mostrarToast(mensaje);
                    void refrescar(sel.id);
                  }}
                  alAviso={(texto) => mostrarToast(texto, "destructive")}
                />
              </div>
              <section
                aria-label={`Conversación con ${sel.nombre}`}
                className={`${vistaAngosta === "chat" ? "flex" : "hidden"} relative min-h-0 w-full min-w-0 flex-col @4xl:flex @4xl:w-[46%] @4xl:max-w-[720px] @4xl:flex-none @4xl:border-l @4xl:border-[var(--wa-borde)]`}
                onDragEnter={(e) => {
                  if (!traeArchivos(e)) return;
                  e.preventDefault();
                  capas.current++;
                  setArrastrando(true);
                }}
                onDragOver={(e) => {
                  if (!traeArchivos(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDragLeave={(e) => {
                  if (!traeArchivos(e)) return;
                  capas.current = Math.max(0, capas.current - 1);
                  if (capas.current === 0) setArrastrando(false);
                }}
                onDrop={(e) => {
                  if (!traeArchivos(e)) return;
                  e.preventDefault();
                  capas.current = 0;
                  setArrastrando(false);
                  soltarArchivos(e.dataTransfer.files);
                }}
              >
                {arrastrando && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--wa-acento)] bg-[color-mix(in_srgb,var(--wa-fondo)_90%,transparent)] text-center"
                  >
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--wa-acento)]">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-4.5-4.5L5 21" />
                    </svg>
                    <span className="text-[17px] font-semibold">Suelta aquí para mandárselo a {sel.nombre}</span>
                    <span className="text-[13px] text-[var(--wa-sec)]">Una foto, captura, audio, video o documento. Antes de enviarlo lo ves y le puedes poner un texto.</span>
                  </div>
                )}
                <div ref={chatRef} className="bandeja-wa-chat flex flex-1 flex-col overflow-y-auto px-[5%] pt-3 pb-2">
                  {enNavegador && (
                    <>
                      <p
                        className={`m-0 mb-2 max-w-[560px] self-center rounded-lg px-3 py-1.5 text-center text-[12.5px] shadow-[0_1px_0.5px_var(--wa-sombra)] ${
                          ventana ? "bg-[var(--wa-aviso)] text-[var(--wa-sec)]" : "bg-warning-soft text-warning"
                        }`}
                      >
                        {ventana
                          ? `Puedes responder con texto libre: ${ventana} de las 24 h desde su último mensaje.`
                          : "Pasaron más de 24 h desde su último mensaje: por WhatsApp solo se le puede escribir con una plantilla aprobada. Las notas privadas sí se pueden dejar."}
                      </p>
                      {!ventana && escribe && !mirando && (
                        <button
                          type="button"
                          onClick={() => setVerPlantillas(true)}
                          className={`mb-2 min-h-9 self-center rounded-full bg-[var(--wa-acento)] px-4 text-[13px] font-semibold text-[var(--wa-acento-texto)] hover:opacity-90 ${anilloFoco}`}
                        >
                          Enviar plantilla
                        </button>
                      )}
                    </>
                  )}
                  {enNavegador && sel.borradaEnApp && (
                    <p className="m-0 mb-2 max-w-[560px] self-center rounded-lg bg-warning-soft px-3 py-1.5 text-center text-[12.5px] text-warning">
                      Este chat se borró en la app de WhatsApp Business ({sel.borradaEnApp.por ? `lo marcó ${sel.borradaEnApp.por}` : "marcado"}, {etiquetaDia(sel.borradaEnApp.en)}). Aquí se conserva todo el historial.
                    </p>
                  )}
                  {mensajes && chat?.hayAnteriores && (
                    <button
                      type="button"
                      onClick={() => void verAnteriores()}
                      disabled={cargandoAnteriores}
                      className={`mb-2 self-center rounded-lg bg-[var(--wa-chip)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--wa-acento)] shadow-[0_1px_0.5px_var(--wa-sombra)] hover:underline disabled:opacity-60 ${anilloFoco}`}
                    >
                      {cargandoAnteriores ? "Trayendo mensajes anteriores…" : "Ver mensajes anteriores"}
                    </button>
                  )}
                  {!mensajes ? (
                    <p className="m-0 self-center rounded-lg bg-[var(--wa-chip)] px-3 py-1.5 text-[12.5px] text-[var(--wa-sec)]">Cargando…</p>
                  ) : (
                    (conReacciones?.visibles ?? mensajes).map((m, i, visibles) => {
                      const dia = etiquetaDia(m.momento);
                      const previo = visibles[i - 1];
                      const separador = i === 0 || etiquetaDia(previo.momento) !== dia;
                      // Seguidos del mismo lado se juntan y solo el primero lleva la colita (como en WhatsApp). Si responde otra persona del
                      // equipo no se juntan, para que se vea quién mandó cada cosa (con su área).
                      const seguido = !separador && !!previo && previo.direccion === m.direccion && previo.autor === m.autor && !esAvisoDelSistema(previo.texto);
                      return (
                        <Fragment key={m.id}>
                          {separador && (
                            <span className="my-2 self-center rounded-lg bg-[var(--wa-chip)] px-3 py-1 text-[12.5px] text-[var(--wa-sec)] shadow-[0_1px_0.5px_var(--wa-sombra)] first-letter:uppercase">
                              {dia}
                            </span>
                          )}
                          {m.importado && (i === 0 || !previo.importado) && (
                            <span className="my-1.5 self-center rounded-lg bg-[var(--wa-aviso)] px-3 py-1 text-center text-[12.5px] text-[var(--wa-sec)] shadow-[0_1px_0.5px_var(--wa-sombra)]">
                              Historial importado del celular
                            </span>
                          )}
                          {!m.importado && i > 0 && previo.importado && (
                            <span className="my-1.5 self-center rounded-lg bg-[var(--wa-aviso)] px-3 py-1 text-center text-[12.5px] text-[var(--wa-sec)] shadow-[0_1px_0.5px_var(--wa-sombra)]">
                              Desde aquí, mensajes que llegaron al sistema
                            </span>
                          )}
                          <Burbuja
                            m={m}
                            seguido={seguido}
                            reacciones={conReacciones?.reacciones.get(m.id)}
                            alPedirBorrar={escribe && !mirando && !esLocal(m) ? (x) => setBorrar({ tipo: "mensaje", mensajeId: x.id, resumen: vistaPreviaTexto(x.texto) || `(${x.tipo})` }) : undefined}
                            alGuardarRapida={escribe && !mirando ? guardarComoRapida : undefined}
                            // Solo se reintenta lo que no salió: «Se envió, pero no se pudo guardar» ya le llegó al dropshipper.
                            alReintentar={esLocal(m) && m.estado === "fallido" && !/^Se envió/.test(m.error ?? "") && m.texto ? () => enviarTexto(sel.id, m.texto ?? "", m.direccion === "nota", m.id) : undefined}
                          />
                        </Fragment>
                      );
                    })
                  )}
                  <div ref={finRef} />
                </div>

                {escribe ? (
                  <div className="relative flex flex-col bg-[var(--wa-panel)]">
                    {mirando && (
                      <p className="m-0 border-b border-[var(--wa-borde)] px-4 py-2 text-[12.5px] text-[var(--wa-sec)]">
                        Estás supervisando el panel de {areaChat(sel.area).etiqueta}: quien lo atiende no ve que abriste este chat y le sigue apareciendo sin leer. Puedes dejar una nota privada
                        (esa sí la ve); para responderle al dropshipper, toca «Intervenir».
                      </p>
                    )}
                    {/* Arriba, si va como mensaje o como nota privada y, escribiendo un mensaje, los mensajes rápidos: así el cuadro de texto queda ancho. */}
                    {(!mirando || (!esNota && !bloqueado)) && (
                      <div className="flex items-center gap-2 px-3 pt-2">
                        {!mirando && (
                          <div role="group" aria-label="Tipo de mensaje" className="flex flex-none rounded-full bg-[var(--wa-fondo)] p-[3px]">
                            <button
                              type="button"
                              aria-pressed={!esNota}
                              onClick={() => setModo("responder")}
                              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${!esNota ? "bg-[var(--wa-acento)] text-[var(--wa-acento-texto)]" : "text-[var(--wa-sec)] hover:bg-[var(--wa-hover)]"} ${anilloFoco}`}
                            >
                              Mensaje
                            </button>
                            <button
                              type="button"
                              aria-pressed={esNota}
                              onClick={() => setModo("nota")}
                              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${esNota ? "bg-[var(--wa-nota-acento)] text-[var(--wa-fondo)]" : "text-[var(--wa-sec)] hover:bg-[var(--wa-hover)]"} ${anilloFoco}`}
                            >
                              Nota privada
                            </button>
                          </div>
                        )}
                        {!esNota && !bloqueado && (
                          <>
                            {/* Con el cuadro vacío, los más usados; escribiendo, los que se parecen a lo escrito («hol» → «Hola, ¿cómo estás?»). */}
                            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              {sugerirRapidas(rapidas, borrador).map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  title={r.texto}
                                  onClick={() => elegirRapida(r)}
                                  className={`flex-none rounded-full border border-[var(--wa-borde)] bg-[var(--wa-fondo)] px-3 py-1 text-[13px] whitespace-nowrap hover:bg-[var(--wa-hover)] ${anilloFoco}`}
                                >
                                  <span className="block max-w-[22rem] truncate">{r.texto}</span>
                                </button>
                              ))}
                            </div>
                            <button type="button" onClick={() => setVerRapidas(true)} aria-label="Mensajes rápidos: ver, agregar o quitar" title="Mensajes rápidos" className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--wa-sec)] hover:bg-[var(--wa-hover)] ${anilloFoco}`}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex items-end gap-2 px-3 py-2">
                      {!esNota && (
                        <>
                          <input
                            ref={inputArchivo}
                            type="file"
                            accept={ACEPTAR_ENVIO}
                            className="sr-only"
                            tabIndex={-1}
                            aria-label="Elegir el archivo que se va a mandar"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) setArchivo(f);
                            }}
                          />
                          <button type="button" disabled={bloqueado || enviando} onClick={() => inputArchivo.current?.click()} aria-label="Adjuntar una foto, audio, video o documento" title="Adjuntar un archivo" className={`${botonIcono} mb-px`}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2" />
                            </svg>
                          </button>
                          <GrabarVoz deshabilitado={bloqueado || enviando} alGrabado={setArchivo} />
                          <Expresiones
                            conversacionId={sel.id}
                            deshabilitado={bloqueado || enviando}
                            alEmoji={insertarEmoji}
                            alEnviado={() => void refrescar(sel.id)}
                            alError={(mensaje) => mostrarToast(mensaje, "destructive")}
                          />
                        </>
                      )}
                      <label className="flex min-w-0 flex-1">
                        <span className="sr-only">{esNota ? "Nota privada para el equipo" : `Mensaje para ${sel.nombre}`}</span>
                        <textarea
                          ref={textoRef}
                          data-enfocar
                          rows={1}
                          value={borrador}
                          disabled={bloqueado}
                          onChange={(e) => setBorrador(e.target.value)}
                          onPaste={(e) => {
                            const pegado = e.clipboardData.files[0];
                            if (pegado && !esNota && !bloqueado && /^image\//.test(pegado.type)) {
                              e.preventDefault();
                              setArchivo(pegado);
                            }
                          }}
                          onKeyDown={(e) => {
                            // Como en WhatsApp: Enter envía y Mayús + Enter baja de línea.
                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                              e.preventDefault();
                              mandar();
                            }
                          }}
                          placeholder={esNota ? "Nota para el equipo. El dropshipper no la ve." : ventana ? "Escribe un mensaje" : "Fuera de las 24 h: hace falta una plantilla aprobada"}
                          className={`min-h-[42px] w-full resize-none rounded-lg border-0 px-3.5 py-[10px] text-[15px] leading-[22px] outline-none placeholder:text-[var(--wa-sec)] focus-visible:ring-2 focus-visible:ring-[var(--wa-acento)] disabled:opacity-60 ${
                            esNota ? "bg-[var(--wa-nota)] text-[var(--wa-nota-texto)]" : "bg-[var(--wa-fondo)] text-[var(--wa-texto)]"
                          }`}
                        />
                      </label>
                      {!esNota && !bloqueado && borrador.trim().length >= 3 && !yaEsRapida(rapidas, borrador) && (
                        <button type="button" onClick={() => guardarComoRapida(borrador)} aria-label="Guardar lo escrito como mensaje rápido" title="Guardar como mensaje rápido" className={`${botonIcono} mb-px`}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 3h12v18l-6-4-6 4V3Z" />
                            <path d="M12 7v6M9 10h6" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={enviando || bloqueado || !borrador.trim()}
                        onClick={mandar}
                        aria-label={enviando ? "Enviando" : esNota ? "Guardar nota privada" : "Enviar mensaje"}
                        className={`flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full text-[var(--wa-acento-texto)] disabled:opacity-40 ${esNota ? "bg-[var(--wa-nota-acento)]" : "bg-[var(--wa-acento)]"} ${anilloFoco}`}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 12 20 4l-6 16-3-7-7-1Z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="m-0 bg-[var(--wa-panel)] px-4 py-3 text-[13px] text-[var(--wa-sec)]">Tienes acceso de solo lectura al CRM.</p>
                )}
              </section>
            </div>
          </div>
        </Ventana>
      )}

      {menuChat &&
        (() => {
          const c = datos.conversaciones.find((x) => x.id === menuChat.id);
          if (!c) return null;
          return (
            <div
              ref={menuChatRef}
              role="menu"
              aria-label={`Opciones del chat con ${c.nombre}`}
              style={{ top: menuChat.y, left: menuChat.x }}
              className="fixed z-50 flex min-w-52 flex-col rounded-lg border border-[var(--wa-borde)] bg-[var(--wa-fondo)] p-1 text-[14px] text-[var(--wa-texto)] shadow-[0_8px_24px_var(--wa-sombra)]"
            >
              <button type="button" role="menuitem" onClick={() => marcarLeido(c, c.noLeidos > 0)} className={`rounded-md px-3 py-2 text-left hover:bg-[var(--wa-hover)] ${anilloFoco}`}>
                {c.noLeidos > 0 ? "Marcar como leído" : "Marcar como no leído"}
              </button>
              {escribe && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuChat(null);
                    setElegido(c.id);
                    setEditandoNombre("cabecera");
                  }}
                  className={`rounded-md px-3 py-2 text-left hover:bg-[var(--wa-hover)] ${anilloFoco}`}
                >
                  Cambiar el nombre
                </button>
              )}
              {escribe && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => etiquetarDesdeLista(c.id)}
                  className={`rounded-md px-3 py-2 text-left hover:bg-[var(--wa-hover)] ${anilloFoco}`}
                >
                  Etiquetas
                </button>
              )}
            </div>
          );
        })()}
      {etiquetando &&
        (() => {
          const c = datos.conversaciones.find((x) => x.id === etiquetando);
          if (!c) return null;
          return (
            <SelectorEtiquetasChat
              ancla={anclaEtiquetas}
              conversacionId={c.id}
              etiquetas={c.etiquetas}
              manejo={manejoEtiquetas}
              alCerrar={(m) => {
                setEtiquetando(null);
                if (m === "escape") anclaEtiquetas.current?.focus();
              }}
            />
          );
        })()}
      {verRapidas && <VentanaRapidas rapidas={rapidas} setRapidas={setRapidas} puedeEditar={escribe && !rapidas.some((r) => r.id.startsWith("base-"))} alCerrar={() => setVerRapidas(false)} />}
      {archivo && sel && (
        <EnviarArchivo
          conversacionId={sel.id}
          nombre={sel.nombre}
          archivo={archivo}
          alCerrar={() => setArchivo(null)}
          alEnviado={() => {
            setArchivo(null);
            mostrarToast("Enviado.");
            void refrescar(sel.id);
          }}
        />
      )}
      {vincular && sel && (
        <VentanaVincular
          conversacionId={sel.id}
          actual={verDropshipper ? { id: verDropshipper.id, nombre: verDropshipper.nombre } : null}
          alCerrar={() => setVincular(false)}
          alListo={(mensaje) => {
            setVincular(false);
            mostrarToast(mensaje);
            void refrescar(sel.id);
          }}
        />
      )}
      {borrar && sel && (
        <PedirBorrado
          conversacionId={sel.id}
          nombre={sel.nombre}
          que={borrar}
          alCerrar={() => setBorrar(null)}
          alPedido={(autorizan) => {
            setBorrar(null);
            mostrarToast(`Petición enviada: ${autorizan.join(", ")} la tiene que autorizar. Hasta entonces no se borra nada.`);
            void refrescar(sel.id);
          }}
        />
      )}
      {verPlantillas && sel && (
        <EnviarPlantilla
          conversacionId={sel.id}
          nombre={sel.nombre}
          alCerrar={() => setVerPlantillas(false)}
          alEnviado={() => {
            setVerPlantillas(false);
            mostrarToast("Plantilla enviada.");
            void refrescar(sel.id);
          }}
        />
      )}

      {importar && (
        <ImportarChat
          abierto
          alCerrar={() => setImportar(null)}
          conversacion={importar.conversacion}
          numeros={datos.numeros}
          areas={areas}
          alTerminar={(id) => {
            if (!importar.conversacion) setFiltro("todas");
            setElegido(id);
            setChat((x) => (x?.id === id ? null : x));
            void refrescar(id);
          }}
        />
      )}
    </div>
  );
}

/** Un bloque de la ficha, separado del siguiente con la franja gris de WhatsApp. */
function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b-8 border-[var(--wa-panel)] px-5 py-4">
      <h3 className="m-0 text-[13px] font-normal text-[var(--wa-sec)]">{titulo}</h3>
      {children}
    </div>
  );
}

/**
 * Un mensaje del chat, como en WhatsApp: del dropshipper a la izquierda en blanco, del equipo a la derecha en verde con sus palomitas,
 * nota privada a la derecha en amarillo con candado (el dropshipper no la ve) y los cambios de área como aviso al centro. `seguido`: va
 * pegado al anterior del mismo lado, sin colita.
 */
/** El botón de la esquina de cada mensaje (se ve al pasar el cursor o al enfocarlo con el teclado): pide borrarlo, no lo borra. */
function BotonBorrarMensaje({ alPulsar }: { alPulsar: () => void }) {
  return (
    <button
      type="button"
      onClick={alPulsar}
      aria-label="Pedir borrar este mensaje"
      className={`absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--wa-fondo)] text-[var(--wa-sec)] opacity-0 shadow-[0_1px_2px_var(--wa-sombra)] group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 ${anilloFoco}`}
    >
      <PapeleraIcon aria-hidden="true" className="h-3 w-3" />
    </button>
  );
}

/** El botón de guardar un mensaje ya mandado como mensaje rápido (junto al de pedir borrarlo; se ve al pasar el cursor o al enfocarlo). */
function BotonRapidaMensaje({ alPulsar }: { alPulsar: () => void }) {
  return (
    <button
      type="button"
      onClick={alPulsar}
      aria-label="Guardar este mensaje como mensaje rápido"
      title="Guardar como mensaje rápido"
      className={`absolute top-1 right-8 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--wa-fondo)] text-[var(--wa-sec)] opacity-0 shadow-[0_1px_2px_var(--wa-sombra)] group-hover:opacity-100 hover:text-[var(--wa-acento)] focus-visible:opacity-100 ${anilloFoco}`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
      </svg>
    </button>
  );
}

function Burbuja({
  m,
  seguido,
  reacciones,
  alPedirBorrar,
  alGuardarRapida,
  alReintentar,
}: {
  m: MensajeVista;
  seguido: boolean;
  /** Las reacciones a este mensaje (una por lado), que se dibujan sobre su borde de abajo, como en WhatsApp. */
  reacciones?: ReaccionVista[];
  alPedirBorrar?: (m: MensajeVista) => void;
  alGuardarRapida?: (texto: string) => void;
  /** Un mensaje que no salió (mostrado al momento de enviar): vuelve a mandarlo. */
  alReintentar?: () => void;
}) {
  if (m.direccion === "nota" && esAvisoDelSistema(m.texto)) {
    return (
      <span className="my-1.5 self-center rounded-lg bg-[var(--wa-chip)] px-3 py-1 text-center text-[12.5px] text-[var(--wa-sec)] shadow-[0_1px_0.5px_var(--wa-sombra)]">
        {m.texto} · {horaMensaje(m.momento)}
      </span>
    );
  }
  const margen = seguido ? "mt-0.5" : "mt-2";
  if (m.direccion === "nota") {
    return (
      <div className={`${margen} group relative max-w-[min(65%,560px)] self-end rounded-lg border border-dashed border-[var(--wa-nota-borde)] bg-[var(--wa-nota)] px-2.5 pt-1.5 pb-2 text-[14px] leading-[19px] text-[var(--wa-nota-texto)]`}>
        {alPedirBorrar && !m.borradoPendiente && <BotonBorrarMensaje alPulsar={() => alPedirBorrar(m)} />}
        <span className="mb-0.5 flex items-center gap-1 text-[11.5px] font-bold tracking-[0.04em] text-[var(--wa-nota-acento)] uppercase">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Nota privada{m.autor ? ` · ${m.autor}` : ""}
          {m.autor && m.autorCargo ? ` (${m.autorCargo})` : ""}
        </span>
        <Contenido m={m} />
        <span className="float-right mt-1.5 -mb-1 ml-2.5 text-[11px] text-[var(--wa-nota-acento)]">
          {horaMensaje(m.momento)}
          {m.estado === "enviando" && " · Guardando…"}
        </span>
        <Fallo m={m} alReintentar={alReintentar} />
      </div>
    );
  }
  const nuestro = m.direccion === "saliente";
  const colita = seguido ? "" : nuestro ? "rounded-tr-none" : "rounded-tl-none";
  const conReaccion = !!reacciones?.length;
  return (
    <div
      className={`${margen} ${conReaccion ? "mb-4" : ""} group relative max-w-[min(65%,560px)] rounded-lg px-2.5 pt-1.5 pb-2 text-[14.2px] leading-[19px] shadow-[0_1px_0.5px_var(--wa-sombra)] ${colita} ${
        nuestro ? "self-end bg-[var(--wa-saliente)]" : "self-start bg-[var(--wa-entrante)]"
      }`}
    >
      {conReaccion && (
        // Como en WhatsApp: el emoji sobre el borde de abajo del mensaje al que se reaccionó.
        <span
          role="img"
          aria-label={`Reacciones: ${reacciones!.map((r) => `${r.emoji} ${r.direccion === "entrante" ? "del dropshipper" : "de la empresa"}`).join(", ")}`}
          className={`absolute -bottom-3.5 ${nuestro ? "right-2" : "left-2"} z-[1] flex items-center gap-0.5 rounded-full border border-[var(--wa-borde)] bg-[var(--wa-entrante)] px-1.5 py-0.5 text-[14px] leading-none shadow-[0_1px_0.5px_var(--wa-sombra)]`}
        >
          {reacciones!.map((r) => (
            <span key={r.direccion} aria-hidden="true">
              {r.emoji}
            </span>
          ))}
        </span>
      )}
      {alPedirBorrar && !m.borradoPendiente && <BotonBorrarMensaje alPulsar={() => alPedirBorrar(m)} />}
      {nuestro && alGuardarRapida && m.tipo === "texto" && (m.texto?.trim().length ?? 0) >= 3 && <BotonRapidaMensaje alPulsar={() => alGuardarRapida(m.texto ?? "")} />}
      {nuestro && m.autor && !seguido && (
        <span className="mb-0.5 block text-[12.5px] font-semibold text-[var(--wa-autor)]">
          {m.autor}
          {m.autorCargo && <span className="font-normal"> · {m.autorCargo}</span>}
        </span>
      )}
      <Contenido m={m} />
      {m.eliminadoEnWhatsapp && (
        <span className="mt-1 block text-[11.5px] font-medium text-[var(--wa-sec)] italic">
          {nuestro ? "Se eliminó desde la app de WhatsApp Business (Meta no dice quién). Aquí se conserva." : "Lo eliminó en WhatsApp quien lo mandó. Aquí se conserva."}
        </span>
      )}
      {m.borradoPendiente && <span className="mt-1 block text-[11.5px] font-medium text-azul">Borrado esperando autorización</span>}
      <span
        className={`float-right mt-1.5 -mb-1 ml-2.5 inline-flex items-center gap-1 text-[11px] tabular-nums ${nuestro ? "text-[var(--wa-meta-saliente)]" : "text-[var(--wa-sec)]"} ${m.estado === "fallido" ? "font-medium text-destructive" : ""}`}
      >
        {m.importado && <span className="sr-only">Importado del celular, </span>}
        {horaMensaje(m.momento)}
        {nuestro && !m.importado && <Palomitas estado={m.estado} />}
      </span>
      <Fallo m={m} alReintentar={alReintentar} />
    </div>
  );
}

/** Por qué no salió un mensaje (o no se guardó una nota) y, si se puede, «Reintentar». */
function Fallo({ m, alReintentar }: { m: MensajeVista; alReintentar?: () => void }) {
  return (
    <>
      {m.estado === "fallido" && m.error && <span className="clear-both block pt-1 text-[11.5px] text-destructive">{m.error}</span>}
      {alReintentar && (
        <button type="button" onClick={alReintentar} className={`clear-both mt-1 block text-[12.5px] font-semibold text-[var(--wa-acento)] hover:underline ${anilloFoco}`}>
          Reintentar
        </button>
      )}
    </>
  );
}
