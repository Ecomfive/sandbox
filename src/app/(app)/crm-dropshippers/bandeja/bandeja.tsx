"use client";

/* eslint-disable @next/next/no-img-element -- fotos que llegan por WhatsApp, servidas por /api/whatsapp/media */
import Link from "next/link";
import { createPortal } from "react-dom";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { textoVentana } from "@/lib/whatsapp/ventana";
import type { AreaCrm } from "@/lib/crm/areas";
import { abrirConversacion, cambiarEstadoConversacion, conectarWebhook360, marcarChatLeido, enviarWhatsapp, intervenirConversacion, mensajesAnteriores, notaWhatsapp, obtenerBandeja, marcarChatBorradoEnApp, pasarConversacionDeArea, tomarConversacion, vistaPreviaChat } from "./actions";
import type { ConversacionVista, MensajeVista, NumeroVista, ResumenDropshipper, VistaPreviaMensaje } from "./datos-bandeja";
import { VistaPreviaChat } from "./vista-previa-chat";
import { SugerenciasDeVinculo, VentanaVincular } from "./vincular-chat";
import { ACEPTAR_ENVIO, EnviarArchivo } from "./enviar-archivo";
import { Expresiones } from "./expresiones";
import { GrabarVoz } from "./grabar-voz";
import { ProductosDelChatFicha } from "./productos-chat";
import { VentanaNombreContacto } from "./nombre-contacto";
import { listarRespuestasRapidas, guardarRespuestaRapida, usarRespuestaRapida } from "./rapidas-actions";
import { VentanaRapidas } from "./respuestas-rapidas";
import { sugerirRapidas, validarRapida, yaEsRapida, type RespuestaRapida } from "@/lib/whatsapp/rapidas";
import { EnviarPlantilla } from "./enviar-plantilla";
import { ImportarChat } from "./importar-chat";
import { PedirBorrado, type QueBorrar } from "./pedir-borrado";
import { MostrarTelefono } from "../mostrar-telefono";
import { PapeleraIcon } from "@/lib/nav-icons";
import { vistaPreviaTexto } from "@/lib/whatsapp/borrado";

/** Qué conversaciones del panel se ven. */
type Filtro = "sinResponder" | "mias" | "todas";
const REFRESCO_MS = 8000;

/** Las áreas de un chat, con el color de su etiqueta y para qué es cada una (boceto https://claude.ai/artifact/Sn3pB4cdUixXk6WdRh4kr8). */
const AREAS_CHAT: { valor: AreaCrm; etiqueta: string; clase: string; para: string }[] = [
  { valor: "atencion", etiqueta: "Atención", clase: "bg-azul-soft text-azul", para: "Soporte: guías, garantías, stock" },
  { valor: "comercial", etiqueta: "Comercial", clase: "bg-success-soft text-success", para: "Precios, volumen, reactivación" },
  { valor: "direccion", etiqueta: "Dirección", clase: "bg-primario-suave text-primario", para: "Solo la ve el CEO" },
];
const areaChat = (a: AreaCrm) => AREAS_CHAT.find((x) => x.valor === a) ?? AREAS_CHAT[0];

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
        !m.conArchivo && !m.mediaNombre && m.tipo !== "reaccion" && <span className="text-[var(--wa-sec)]">Mensaje que el sistema todavía no muestra ({m.tipo}).</span>
      )}
    </>
  );
}

/** Un botón redondo de ícono, como los de la barra de WhatsApp. */
const botonIcono = `flex h-10 w-10 flex-none items-center justify-center rounded-full text-[var(--wa-sec)] hover:bg-[var(--wa-hover)] disabled:opacity-50 ${anilloFoco}`;
/** Un botón con texto de la cabecera del chat. */
const botonPildora = `inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--wa-borde)] bg-[var(--wa-fondo)] px-3 text-[13px] font-medium hover:bg-[var(--wa-hover)] disabled:opacity-50 ${anilloFoco}`;

/**
 * La bandeja de WhatsApp (26 oct 2026). **Paneles** (29 oct 2026, pedido de Hernán): uno por área; cada quien ve el suyo (`miArea`) y los
 * de las áreas de abajo (`areas`), que supervisa en silencio: abrir un chat de otro panel no lo marca leído (actions.ts) y para responder
 * hay que «Intervenir»; las notas privadas sí se dejan. Desde el 28 oct 2026 se ve y se usa como WhatsApp (pedido de Hernán; prototipo
 * https://claude.ai/artifact/RGtk9mxmht8nzneUX75ucx): a la izquierda «Chats» con el buscador, los filtros (Sin responder, Mías, Todas y,
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
  inicial: { numeros: NumeroVista[]; conversaciones: ConversacionVista[] };
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
  // El panel que se mira: el del chat pedido con ?abrir=, si no el propio (o, si el propio está vacío, el primero con chats).
  const [panel, setPanel] = useState<AreaCrm>(() => {
    const pedido = inicial.conversaciones.find((c) => c.id === abrirInicial)?.area;
    if (pedido) return pedido;
    if (inicial.conversaciones.some((c) => c.area === miArea)) return miArea;
    return areas.find((a) => inicial.conversaciones.some((c) => c.area === a)) ?? miArea;
  });
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
  const [nombreDe, setNombreDe] = useState<{ id: string; nombre: string; personalizado: string | null } | null>(null);
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
      const left = Math.max(8, Math.min(r.right + 8, window.innerWidth - 360));
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
  const [menuArea, setMenuArea] = useState(false);
  const [verFicha, setVerFicha] = useState(true);
  // En pantallas angostas (menos de 1280 px) la ficha no cabe al lado: se abre encima de todo al tocar el nombre (29 oct 2026).
  const [fichaEncima, setFichaEncima] = useState(false);
  const pantallaAncha = useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(PANTALLA_ANCHA);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => window.matchMedia(PANTALLA_ANCHA).matches,
    () => true,
  );
  const fichaVisible = pantallaAncha ? verFicha : fichaEncima;
  const alternarFicha = (abrir?: boolean) => (pantallaAncha ? setVerFicha : setFichaEncima)((v) => abrir ?? !v);
  // Encima, va en el <body> con un fondo oscuro que la cierra al tocarlo: dentro de la página quedaría encerrada en su recuadro.
  const comoFicha = (ficha: ReactNode) =>
    pantallaAncha
      ? ficha
      : createPortal(
          <div className="bandeja-wa fixed inset-0 z-50 flex justify-end bg-black/40" onClick={(e) => e.target === e.currentTarget && setFichaEncima(false)}>
            {ficha}
          </div>,
          document.body,
        );
  const [enviando, empezar] = useTransition();
  const finRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);

  const refrescar = useCallback(async (id: string | null) => {
    const b = await obtenerBandeja().catch(() => null);
    if (b && !("error" in b)) setDatos(b);
    if (id) {
      const c = await abrirConversacion(id).catch(() => null);
      if (c && !("error" in c))
        setChat((antes) =>
          antes && antes.id !== id ? antes : antes ? { ...antes, ...c, mensajes: unirMensajes(antes.mensajes, c.mensajes), hayAnteriores: antes.hayAnteriores } : { id, ...c },
        );
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
  const deNumero = useMemo(() => delNumero.filter((c) => c.area === panel), [delNumero, panel]);
  const opciones: { id: Filtro; texto: string; cuenta: number }[] = [
    { id: "sinResponder", texto: "Sin responder", cuenta: deNumero.filter(sinResponder).length },
    { id: "mias", texto: "Mías", cuenta: deNumero.filter((c) => c.asignadaAId === miId).length },
    { id: "todas", texto: "Todas", cuenta: deNumero.length },
  ];
  const supervisandoPanel = panel !== miArea;
  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return deNumero
      .filter(
        (c) =>
          // El chat abierto se queda en la lista aunque ya no cumpla el filtro (al leerlo deja de estar «Sin responder»), como en WhatsApp.
          c.id === elegido ||
          (filtro === "sinResponder" ? sinResponder(c) : filtro === "mias" ? c.asignadaAId === miId : true),
      )
      .filter((c) => !q || [c.nombre, c.nombrePerfil, c.codigo, ...c.tiendas].some((x) => x?.toLowerCase().includes(q)));
  }, [deNumero, filtro, buscar, miId, elegido]);

  const sel = datos.conversaciones.find((c) => c.id === elegido) ?? null;
  const ventana = sel && enNavegador ? textoVentana(sel.ultimoEntranteEn) : null;
  // Supervisión: un chat de otro panel se mira sin dejar rastro; para responderle al dropshipper hay que «Intervenir» (queda a su cargo).
  const supervisando = !!sel && sel.area !== miArea;
  const mirando = supervisando && sel?.asignadaAId !== miId;
  const esNota = modo === "nota" || mirando;
  const bloqueado = !escribe || (!esNota && !ventana);
  const mensajes = chat && sel && chat.id === sel.id ? chat.mensajes : null;
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
    setMenuArea(false);
    const queda = areas.includes(destino);
    accion(() => pasarConversacionDeArea(sel.id, destino), queda ? `Chat pasado a ${areaChat(destino).etiqueta}.` : `Chat pasado a ${areaChat(destino).etiqueta}. Ya no lo verás en tu bandeja.`);
    // Si sigue a la vista, se pasa con él a su nuevo panel.
    if (queda) setPanel(destino);
    else setElegido(null);
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

  const verDropshipper = chat?.id === sel?.id ? chat?.dropshipper : null;

  return (
    <div className="bandeja-wa flex min-h-[640px] overflow-hidden rounded-[14px] border border-[var(--wa-borde)] bg-[var(--wa-fondo)] text-[var(--wa-texto)] lg:h-[calc(100vh-200px)]">
      {/* ===== Chats ===== */}
      <aside aria-label="Conversaciones" className={`${sel ? "hidden lg:flex" : "flex"} w-full flex-col border-[var(--wa-borde)] lg:w-[380px] lg:flex-none lg:border-r`}>
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="m-0 text-[22px] font-bold">{areas.length > 1 ? `Panel de ${areaChat(panel).etiqueta}` : "Chats"}</h2>
            {/* Con un solo número a la vista (Atención) no se dice nada: solo se cuenta cuando hay más de uno. */}
            {(supervisandoPanel || datos.numeros.length > 1) && (
              <span className="truncate text-[12.5px] text-[var(--wa-sec)] tabular-nums">{supervisandoPanel ? "Supervisión: lo que abras aquí no se marca leído" : `${datos.numeros.length} números de WhatsApp`}</span>
            )}
          </div>
          {escribe && (
            <button type="button" onClick={() => setImportar({ conversacion: null })} className={botonIcono} aria-label="Importar un chat exportado desde el celular" title="Importar un chat del celular">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2 px-3 pt-2 pb-2.5">
          {areas.length > 1 && (
            <div role="group" aria-label="Paneles" className="flex rounded-lg bg-[var(--wa-panel)] p-[3px]">
              {areas.map((a) => {
                const pendientes = delNumero.filter((c) => c.area === a && sinResponder(c)).length;
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={panel === a}
                    onClick={() => {
                      if (panel === a) return;
                      setPanel(a);
                      setElegido(null);
                      setMenuArea(false);
                    }}
                    className={`inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] ${
                      panel === a ? "bg-[var(--wa-fondo)] font-semibold shadow-[0_1px_0.5px_var(--wa-sombra)]" : "text-[var(--wa-sec)] hover:text-[var(--wa-texto)]"
                    } ${anilloFoco}`}
                  >
                    {areaChat(a).etiqueta}
                    {a === miArea && <span className="text-[11px] font-normal text-[var(--wa-sec)]">(tuyo)</span>}
                    {pendientes > 0 && (
                      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--wa-acento)] px-1 text-[11px] font-semibold text-[var(--wa-acento-texto)] tabular-nums">
                        {pendientes}
                        <span className="sr-only"> sin responder</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-lg bg-[var(--wa-panel)] px-3.5 text-[var(--wa-sec)] focus-within:ring-2 focus-within:ring-[var(--wa-acento)]">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span className="sr-only">Buscar conversación</span>
              <input
                type="search"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar nombre, teléfono o tienda"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--wa-texto)] outline-none placeholder:text-[var(--wa-sec)]"
              />
            </label>
            {datos.numeros.length > 1 && (
              <label className="flex">
                <span className="sr-only">Número de la empresa</span>
                <select value={numero} onChange={(e) => setNumero(e.target.value)} className={`h-10 max-w-[150px] rounded-lg border-0 bg-[var(--wa-panel)] px-2 text-[13px] ${anilloFoco}`}>
                  <option value="todos">Todos los números</option>
                  {datos.numeros.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div role="group" aria-label="Qué conversaciones ver" className="flex flex-wrap gap-1.5">
            {opciones.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={filtro === o.id}
                onClick={() => setFiltro(o.id)}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] ${
                  filtro === o.id ? "bg-[var(--wa-acento-suave)] font-semibold text-[var(--wa-acento-suave-texto)]" : "bg-[var(--wa-panel)] text-[var(--wa-sec)] hover:bg-[var(--wa-borde)]"
                } ${anilloFoco}`}
              >
                {o.texto}
                {o.cuenta > 0 && <span className="tabular-nums">{o.cuenta}</span>}
              </button>
            ))}
          </div>
        </div>
        <ul className="m-0 flex-1 list-none overflow-y-auto p-0">
          {lista.map((c) => {
            const actual = c.id === elegido;
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
                  onClick={() => {
                    ocultarVistaPrevia();
                    setElegido(c.id);
                    setMenuArea(false);
                    setChat((x) => (x?.id === c.id ? x : null));
                    // Al abrirla queda leída (el servidor la marca en `abrirConversacion`), solo en el panel propio: supervisando, no.
                    if (c.area === miArea) setDatos((d) => ({ ...d, conversaciones: d.conversaciones.map((x) => (x.id === c.id ? { ...x, noLeidos: 0 } : x)) }));
                  }}
                  aria-current={actual ? "true" : undefined}
                  onFocus={(e) => !actual && verVistaPrevia(c, e.currentTarget)}
                  onBlur={ocultarVistaPrevia}
                  className={`flex w-full items-center gap-3 pl-3.5 text-left ${actual ? "bg-[var(--wa-sel)]" : "hover:bg-[var(--wa-hover)]"} ${anilloFoco}`}
                >
                  <Foto nombre={c.nombre} tam="lista" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 border-b border-[var(--wa-borde)] py-3 pr-3.5">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[16px]">{c.nombre}</span>
                      <span className={`flex-none text-xs tabular-nums ${c.noLeidos ? "font-semibold text-[var(--wa-acento)]" : "text-[var(--wa-sec)]"}`}>{enNavegador ? horaCorta(c.ultimoMensajeEn) : ""}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-[var(--wa-sec)]">
                      {c.ultimoDe === "saliente" && <Palomitas estado="entregado" />}
                      {c.ultimoDe === "nota" && (
                        <span className="flex-none font-medium text-[var(--wa-nota-acento)]">Nota:</span>
                      )}
                      <span className={`min-w-0 flex-1 truncate ${c.noLeidos ? "font-medium text-[var(--wa-texto)]" : ""}`}>{c.ultimoTexto ?? ""}</span>
                      {c.noLeidos > 0 && (
                        <span className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-[var(--wa-acento)] px-1.5 text-xs font-semibold text-[var(--wa-acento-texto)] tabular-nums">
                          {c.noLeidos}
                          <span className="sr-only"> sin leer</span>
                        </span>
                      )}
                    </span>
                    {(!c.dropshipperId || c.estado === "resuelta" || c.asignadaA || c.borradaEnApp || datos.numeros.length > 1) && (
                      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11.5px] text-[var(--wa-sec)]">
                        {!c.dropshipperId && <span className="rounded-full bg-warning-soft px-2 py-px font-medium text-warning">No está en el CRM</span>}
                        {c.borradaEnApp && <span className="rounded-full bg-warning-soft px-2 py-px font-medium text-warning">Borrado en la app</span>}
                        {c.estado === "resuelta" && <span className="rounded-full bg-success-soft px-2 py-px font-medium text-success">Resuelta</span>}
                        {datos.numeros.length > 1 && <span>{numeroDe.get(c.numeroId)?.nombre}</span>}
                        {c.asignadaA && <span>· {c.asignadaA}</span>}
                      </span>
                    )}
                  </span>
                </button>
                {vista?.id === c.id && <VistaPreviaChat nombre={c.nombre} mensajes={vista.mensajes} noLeidos={c.noLeidos} top={vista.top} left={vista.left} />}
              </li>
            );
          })}
          {!lista.length && <li className="px-4 py-10 text-center text-sm text-[var(--wa-sec)]">{filtro === "sinResponder" ? "Nada sin responder." : "No hay conversaciones con este filtro."}</li>}
        </ul>
      </aside>

      {/* ===== Conversación ===== */}
      {sel ? (
        <section aria-label={`Conversación con ${sel.nombre}`} className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--wa-borde)] bg-[var(--wa-panel)] px-3 py-2">
            <button type="button" onClick={() => setElegido(null)} className={`${botonIcono} lg:hidden`} aria-label="Volver a las conversaciones">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => alternarFicha()}
              aria-expanded={fichaVisible}
              aria-label={`${fichaVisible ? "Cerrar" : "Ver"} la ficha de ${sel.nombre}`}
              className={`flex min-w-0 flex-[1_1_200px] items-center gap-3 rounded-lg py-0.5 text-left ${anilloFoco}`}
            >
              <Foto nombre={sel.nombre} tam="cabecera" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[16px]">{sel.nombre}</span>
                <span className="truncate text-[13px] text-[var(--wa-sec)] tabular-nums">
                  {[
                    sel.codigo,
                    sel.nombrePerfil && sel.nombrePerfil !== sel.nombre ? `«${sel.nombrePerfil}» en WhatsApp` : null,
                    datos.numeros.length > 1 ? numeroDe.get(sel.numeroId)?.nombre : null,
                    sel.asignadaA ? `la lleva ${sel.asignadaA}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </button>
            {escribe && (
              <button type="button" onClick={() => setNombreDe({ id: sel.id, nombre: sel.nombre, personalizado: sel.nombrePersonalizado })} aria-label="Cambiar el nombre del contacto" title="Cambiar el nombre" className={`${botonIcono} !h-8 !w-8`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                </svg>
              </button>
            )}
            <EtiquetaArea area={sel.area} />
            {sel.borradaEnApp && <span className="rounded-full bg-warning-soft px-2 py-px text-[11.5px] font-medium text-warning">Borrado en la app</span>}
            {sel.borradoPendiente && (
              <Link href="/crm-dropshippers/borrados" className={`rounded-full bg-azul-soft px-2 py-px text-[11.5px] font-medium text-azul hover:underline ${anilloFoco}`}>
                Borrado esperando autorización
              </Link>
            )}
            <button type="button" className={botonPildora} onClick={() => marcarLeido(sel, false)}>
              Marcar como no leído
            </button>
            {escribe && mirando && (
              <button
                type="button"
                disabled={enviando}
                className={`inline-flex min-h-9 items-center rounded-full bg-[var(--wa-acento)] px-3.5 text-[13px] font-semibold text-[var(--wa-acento-texto)] hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}
                onClick={() => accion(() => intervenirConversacion(sel.id), "Intervienes en este chat: ya puedes responderle.")}
                title="Tomar el chat para responderle al dropshipper. Queda una nota en el chat."
              >
                Intervenir
              </button>
            )}
            {escribe && !mirando && (
              <>
                {sel.asignadaAId === miId ? (
                  <button type="button" disabled={enviando} className={botonPildora} onClick={() => accion(() => tomarConversacion(sel.id, true), "Soltaste la conversación.")}>
                    Soltar
                  </button>
                ) : (
                  <button type="button" disabled={enviando} className={botonPildora} onClick={() => accion(() => tomarConversacion(sel.id), "La conversación quedó a tu cargo.")}>
                    {sel.asignadaA ? `Tomar (la lleva ${sel.asignadaA})` : "Tomar"}
                  </button>
                )}
                <div ref={menuRef} className="relative">
                  <button type="button" disabled={enviando} aria-haspopup="menu" aria-expanded={menuArea} onClick={() => setMenuArea((v) => !v)} className={botonPildora}>
                    Pasar a otra área
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {menuArea && (
                    <div role="menu" aria-label="Pasar a otra área" className="absolute top-[calc(100%+6px)] right-0 z-20 flex w-64 flex-col rounded-[10px] border border-[var(--wa-borde)] bg-[var(--wa-fondo)] p-1.5 shadow-lg">
                      <p className="m-0 px-2 pt-1 pb-1.5 text-[11.5px] text-[var(--wa-sec)]">El chat pasa a esa área. Quien no la ve deja de verlo.</p>
                      {AREAS_CHAT.filter((a) => a.valor !== sel.area).map((a) => (
                        <button key={a.valor} type="button" role="menuitem" onClick={() => pasarA(a.valor)} className={`flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--wa-hover)] ${anilloFoco}`}>
                          <EtiquetaArea area={a.valor} />
                          <span className="text-[11.5px] text-[var(--wa-sec)]">{a.para}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" disabled={enviando} className={botonPildora} onClick={() => setImportar({ conversacion: sel })} title="Traer el historial que quedó en el celular">
                  Importar chat
                </button>
                <button
                  type="button"
                  disabled={enviando}
                  className={botonPildora}
                  onClick={() => accion(() => marcarChatBorradoEnApp(sel.id, !sel.borradaEnApp), sel.borradaEnApp ? "Quitaste la marca." : "Marcado: se borró en la app de WhatsApp Business. Aquí se conserva todo.")}
                >
                  {sel.borradaEnApp ? "Quitar marca de borrado" : "Marcar borrado en la app"}
                </button>
                {!sel.borradoPendiente && (
                  <button type="button" disabled={enviando} className={botonPildora} onClick={() => setBorrar({ tipo: "chat" })}>
                    Pedir borrar el chat
                  </button>
                )}
                {sel.estado === "abierta" ? (
                  <button type="button" disabled={enviando} className={botonPildora} onClick={() => accion(() => cambiarEstadoConversacion(sel.id, "resuelta"), "Marcada resuelta. Si vuelve a escribir, se reabre sola.")}>
                    Marcar resuelta
                  </button>
                ) : (
                  <button type="button" disabled={enviando} className={botonPildora} onClick={() => accion(() => cambiarEstadoConversacion(sel.id, "abierta"), "Conversación reabierta.")}>
                    Reabrir
                  </button>
                )}
              </>
            )}
          </div>

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
              mensajes.map((m, i) => {
                const dia = etiquetaDia(m.momento);
                const previo = mensajes[i - 1];
                const separador = i === 0 || etiquetaDia(previo.momento) !== dia;
                // Seguidos del mismo lado se juntan y solo el primero lleva la colita (como en WhatsApp).
                const seguido = !separador && !!previo && previo.direccion === m.direccion && !esAvisoDelSistema(previo.texto);
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
                    <Burbuja m={m} seguido={seguido} alPedirBorrar={escribe && !mirando ? (x) => setBorrar({ tipo: "mensaje", mensajeId: x.id, resumen: vistaPreviaTexto(x.texto) || `(${x.tipo})` }) : undefined} alGuardarRapida={escribe && !mirando ? guardarComoRapida : undefined} />
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
              {!esNota && !bloqueado && (
                <div className="flex items-center gap-2 px-3 pt-2">
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
                </div>
              )}
              <div className="flex items-end gap-2 px-3 py-2">
                <div role="group" aria-label="Tipo de mensaje" className={`mb-1 flex-none rounded-full bg-[var(--wa-fondo)] p-[3px] ${mirando ? "hidden" : "flex"}`}>
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
      ) : (
        <div className="bandeja-wa-chat hidden flex-1 flex-col items-center justify-center gap-2 p-8 text-center lg:flex">
          <span className="text-[22px] font-light">Bandeja de WhatsApp</span>
          <span className="max-w-sm text-sm text-[var(--wa-sec)]">Elige una conversación de la lista para responder o dejar una nota privada.</span>
        </div>
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
                    setNombreDe({ id: c.id, nombre: c.nombre, personalizado: c.nombrePersonalizado });
                  }}
                  className={`rounded-md px-3 py-2 text-left hover:bg-[var(--wa-hover)] ${anilloFoco}`}
                >
                  Cambiar el nombre
                </button>
              )}
            </div>
          );
        })()}
      {verRapidas && <VentanaRapidas rapidas={rapidas} setRapidas={setRapidas} puedeEditar={escribe && !rapidas.some((r) => r.id.startsWith("base-"))} alCerrar={() => setVerRapidas(false)} />}
      {nombreDe && (
        <VentanaNombreContacto
          conversacionId={nombreDe.id}
          nombreActual={nombreDe.nombre}
          personalizado={nombreDe.personalizado}
          alCerrar={() => setNombreDe(null)}
          alListo={(mensaje) => {
            setNombreDe(null);
            mostrarToast(mensaje);
            void refrescar(elegido);
          }}
        />
      )}
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

      {/* ===== Ficha del dropshipper (como «Info del contacto») ===== */}
      {sel &&
        fichaVisible &&
        comoFicha(
          <aside
            aria-label="Ficha del dropshipper"
            className={`flex w-[330px] max-w-full flex-none flex-col overflow-y-auto border-l border-[var(--wa-borde)] bg-[var(--wa-fondo)] ${pantallaAncha ? "" : "h-full shadow-2xl"}`}
          >
            <div className="flex items-center gap-3 bg-[var(--wa-panel)] px-3 py-2.5">
              <button type="button" onClick={() => alternarFicha(false)} aria-label="Cerrar la ficha" className={botonIcono}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
              <h2 className="m-0 text-base font-semibold">Ficha del dropshipper</h2>
            </div>
            <div className="flex flex-col items-center gap-1 border-b-8 border-[var(--wa-panel)] px-4 pt-6 pb-5 text-center">
              <Foto nombre={sel.nombre} tam="ficha" />
              <span className="mt-3 flex max-w-full items-center justify-center gap-1">
                <span className="min-w-0 text-xl [overflow-wrap:anywhere]">{sel.nombre}</span>
                {escribe && (
                  <button type="button" onClick={() => setNombreDe({ id: sel.id, nombre: sel.nombre, personalizado: sel.nombrePersonalizado })} aria-label="Cambiar el nombre del contacto" title="Cambiar el nombre" className={`${botonIcono} !h-8 !w-8 flex-none`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                    </svg>
                  </button>
                )}
              </span>
              {(sel.codigo || verTelefono) && (
                <span className="flex items-center gap-1 text-[15px] text-[var(--wa-sec)] tabular-nums">
                  {sel.codigo}
                  <MostrarTelefono tipo="conversacion" id={sel.id} puede={verTelefono} />
                </span>
              )}
            </div>
            <ProductosDelChatFicha key={sel.id} conversacionId={sel.id} escribe={escribe && !mirando} alAviso={(texto) => mostrarToast(texto, "destructive")} />
            {verDropshipper ? (
              <>
                <Bloque titulo="Dónde vende">
                  <div className="flex flex-wrap gap-1.5">
                    {[...verDropshipper.tiendas, ...verDropshipper.cuentas].map((t) => (
                      <span key={t} className="rounded-md bg-[var(--wa-panel)] px-2 py-0.5 text-[13px]">
                        {t}
                      </span>
                    ))}
                    {!verDropshipper.tiendas.length && !verDropshipper.cuentas.length && <span className="text-[13px] text-[var(--wa-sec)]">Sin tiendas ni cuentas vinculadas.</span>}
                  </div>
                </Bloque>
                <Bloque titulo="Estado">
                  <span className="self-start rounded-full bg-success-soft px-2 py-px text-xs font-medium text-success capitalize">{verDropshipper.estado}</span>
                </Bloque>
                <Bloque titulo="Casos abiertos">
                  {verDropshipper.casos.length ? (
                    verDropshipper.casos.map((c) => (
                      <div key={c.codigo} className="rounded-lg border border-[var(--wa-borde)] px-2.5 py-1.5 text-[13px]">
                        <span className="block text-[11.5px] text-[var(--wa-sec)] tabular-nums">
                          {c.codigo}
                          {c.prioridad === "alta" && <span className="font-semibold text-destructive"> · alta</span>}
                        </span>
                        {c.titulo}
                      </div>
                    ))
                  ) : (
                    <span className="text-[13px] text-[var(--wa-sec)]">Sin casos abiertos.</span>
                  )}
                </Bloque>
              </>
            ) : !sel.dropshipperId ? (
              <Bloque titulo="No está en el CRM">
                <SugerenciasDeVinculo
                  conversacionId={sel.id}
                  escribe={escribe}
                  alAbrirBusqueda={() => setVincular(true)}
                  alListo={(mensaje) => {
                    mostrarToast(mensaje);
                    void refrescar(sel.id);
                  }}
                />
                <Link href={`/crm-dropshippers?buscar=${encodeURIComponent(sel.nombrePerfil ?? sel.nombre)}`} className={`text-[14px] font-medium text-[var(--wa-acento)] hover:underline ${anilloFoco}`}>
                  Buscarlo en el CRM
                </Link>
              </Bloque>
            ) : null}
            <Bloque titulo="Área del chat">
              <span className="self-start">
                <EtiquetaArea area={sel.area} />
              </span>
              <div className="flex flex-col gap-1 text-[12.5px] text-[var(--wa-sec)]">
                {cambiosDeArea.length ? cambiosDeArea.map((m) => <span key={m.id}>{`${m.texto} · ${horaCorta(m.momento)}`}</span>) : <span>Entró a {areaChat(sel.area).etiqueta} con su primer mensaje.</span>}
              </div>
            </Bloque>
            {verDropshipper && (
              <div className="px-5 py-4">
                <Link href={`/crm-dropshippers?abrir=${verDropshipper.id}`} className={`flex items-center gap-3 py-1 text-[15px] text-[var(--wa-acento)] hover:underline ${anilloFoco}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M20 21a8 8 0 0 0-16 0" />
                    <circle cx="12" cy="8" r="4" />
                  </svg>
                  Abrir su ficha en el CRM
                </Link>
                {escribe && (
                  <button type="button" onClick={() => setVincular(true)} className={`py-1 text-left text-[14px] text-[var(--wa-sec)] hover:underline ${anilloFoco}`}>
                    No es este dropshipper
                  </button>
                )}
              </div>
            )}
          </aside>,
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

/** Desde este ancho la ficha va al lado del chat; más angosto, se abre encima. */
const PANTALLA_ANCHA = "(min-width: 1280px)";

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

function Burbuja({ m, seguido, alPedirBorrar, alGuardarRapida }: { m: MensajeVista; seguido: boolean; alPedirBorrar?: (m: MensajeVista) => void; alGuardarRapida?: (texto: string) => void }) {
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
        </span>
        <Contenido m={m} />
        <span className="float-right mt-1.5 -mb-1 ml-2.5 text-[11px] text-[var(--wa-nota-acento)]">{horaMensaje(m.momento)}</span>
      </div>
    );
  }
  const nuestro = m.direccion === "saliente";
  const colita = seguido ? "" : nuestro ? "rounded-tr-none" : "rounded-tl-none";
  return (
    <div
      className={`${margen} group relative max-w-[min(65%,560px)] rounded-lg px-2.5 pt-1.5 pb-2 text-[14.2px] leading-[19px] shadow-[0_1px_0.5px_var(--wa-sombra)] ${colita} ${
        nuestro ? "self-end bg-[var(--wa-saliente)]" : "self-start bg-[var(--wa-entrante)]"
      }`}
    >
      {alPedirBorrar && !m.borradoPendiente && <BotonBorrarMensaje alPulsar={() => alPedirBorrar(m)} />}
      {nuestro && alGuardarRapida && m.tipo === "texto" && (m.texto?.trim().length ?? 0) >= 3 && <BotonRapidaMensaje alPulsar={() => alGuardarRapida(m.texto ?? "")} />}
      {nuestro && m.autor && !seguido && <span className="mb-0.5 block text-[12.5px] font-semibold text-[var(--wa-autor)]">{m.autor}</span>}
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
      {m.estado === "fallido" && m.error && <span className="clear-both block pt-1 text-[11.5px] text-destructive">{m.error}</span>}
    </div>
  );
}
