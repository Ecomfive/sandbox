// Prioridad de los chats de la bandeja de WhatsApp (29 oct 2026, migración 0189): no es lo mismo una queja que alguien que quiere privatizar un producto. La IA dice el motivo de cada
// chat, cada motivo tiene su plazo de respuesta y la lista se ordena por lo cerca o pasado que está ese plazo. Aquí vive lo puro y con prueba: los grupos y sus plazos, cómo se calcula
// la urgencia, qué se le pide a la IA (con las correcciones del equipo como ejemplo) y cómo se valida lo que devuelve.

import { MOTIVOS, textoParaIA, type MensajeActividad } from "./actividad";

export type GrupoMotivo = "queja" | "pedido" | "pagos" | "consulta" | "comercial" | "otro";
export type NivelPrioridad = "urgente" | "alta" | "normal" | "baja";

export interface Grupo {
  id: GrupoMotivo;
  /** Lo que se ve en la pastilla del chat. */
  corto: string;
  etiqueta: string;
  emoji: string;
  nivel: NivelPrioridad;
  /** En cuántos minutos hay que contestarle; null = sin plazo (se atiende cuando haya tiempo). */
  plazoMin: number | null;
}

/** Los grupos, del más urgente al menos. El orden importa: un VIP sube al grupo de arriba (`plazoDe`). */
export const GRUPOS: Grupo[] = [
  { id: "queja", corto: "Queja", etiqueta: "Queja o reclamo", emoji: "🔴", nivel: "urgente", plazoMin: 15 },
  { id: "pedido", corto: "Pedido", etiqueta: "Problema con un pedido", emoji: "🟠", nivel: "alta", plazoMin: 30 },
  { id: "pagos", corto: "Pagos", etiqueta: "Pagos y retiros", emoji: "🟡", nivel: "alta", plazoMin: 60 },
  { id: "consulta", corto: "Consulta", etiqueta: "Pregunta de producto, stock o cuenta", emoji: "🔵", nivel: "normal", plazoMin: 120 },
  { id: "comercial", corto: "Comercial", etiqueta: "Comercial (privatizar, precio especial)", emoji: "🟢", nivel: "normal", plazoMin: 240 },
  { id: "otro", corto: "Otro", etiqueta: "Saludo u otro", emoji: "⚪", nivel: "baja", plazoMin: null },
];

const IDS_GRUPO = new Set<string>(GRUPOS.map((g) => g.id));
export const esGrupo = (v: unknown): v is GrupoMotivo => typeof v === "string" && IDS_GRUPO.has(v);
export const grupoPorId = (id: string | null | undefined): Grupo | null => GRUPOS.find((g) => g.id === id) ?? null;

/** A qué grupo va cada motivo específico de la lista de la actividad del cliente (src/lib/whatsapp/actividad.ts). Lo que no está aquí va a «otro». */
const GRUPO_DE_MOTIVO: Record<string, GrupoMotivo> = {
  queja_servicio: "queja",
  producto_defectuoso: "queja",
  estado_guia: "pedido",
  entrega_demorada: "pedido",
  novedad_entrega: "pedido",
  cambio_cancelacion: "pedido",
  devolucion_solicitud: "pedido",
  devolucion_estado: "pedido",
  seguimiento: "pedido",
  retiro_estado: "pagos",
  pago_pendiente: "pagos",
  saldo_wallet: "pagos",
  stock_disponible: "consulta",
  llegada_mercancia: "consulta",
  info_producto: "consulta",
  catalogo: "consulta",
  acceso_cuenta: "consulta",
  conectar_tienda: "consulta",
  error_plataforma: "consulta",
  como_empezar: "consulta",
  como_funciona: "consulta",
  consejos_venta: "consulta",
  producto_privado: "comercial",
  precio_comision: "comercial",
};

/** El grupo de un motivo específico; si el cliente está molesto, es una queja aunque pregunte otra cosa. */
export function grupoDeMotivo(motivo: string | null, molesto = false): GrupoMotivo {
  if (molesto) return "queja";
  return (motivo && GRUPO_DE_MOTIVO[motivo]) || "otro";
}

/** El plazo en minutos de un grupo. Un dropshipper VIP tiene el plazo del grupo de arriba (una queja ya es lo más urgente). */
export function plazoDe(grupo: GrupoMotivo, vip = false): number | null {
  const i = GRUPOS.findIndex((g) => g.id === grupo);
  if (i < 0) return null;
  return GRUPOS[vip ? Math.max(0, i - 1) : i].plazoMin;
}

export type EstadoPlazo = "a_tiempo" | "cerca" | "vencido";
/** Desde qué parte del plazo se avisa que se está por vencer. */
export const AVISO_CERCA = 0.75;
/** Para ordenar los chats sin plazo: cuentan como si tuvieran un día. */
const PLAZO_SIN_PLAZO_MIN = 24 * 60;

export interface Plazo {
  /** Minutos que lleva esperando. */
  espera: number;
  plazoMin: number | null;
  estado: EstadoPlazo;
  /** Minutos que faltan (negativo: hace cuánto venció). null sin plazo. */
  restan: number | null;
}

/** Cómo va el plazo de un chat que espera desde `desde`. */
export function plazoDelChat(desde: string, grupo: GrupoMotivo | null, vip: boolean, ahora = Date.now()): Plazo {
  const espera = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 60_000));
  const plazoMin = grupo ? plazoDe(grupo, vip) : null;
  if (plazoMin == null) return { espera, plazoMin, estado: "a_tiempo", restan: null };
  const estado: EstadoPlazo = espera >= plazoMin ? "vencido" : espera >= plazoMin * AVISO_CERCA ? "cerca" : "a_tiempo";
  return { espera, plazoMin, estado, restan: plazoMin - espera };
}

export interface ChatParaOrdenar {
  /** Desde cuándo espera respuesta; null si no espera. */
  esperandoDesde: string | null;
  grupo: GrupoMotivo | null;
  vip: boolean;
  /** Para desempatar y ordenar los que no esperan: lo más nuevo arriba. */
  ultimoMensajeEn: string | null;
}

/**
 * Cuán urgente es contestar: qué parte del plazo ya se gastó (1 = vence ahora, 2 = venció hace otro plazo entero). Un chat sin motivo todavía cuenta con el plazo de una consulta, para
 * que no quede al fondo mientras la IA lo lee. Los que no esperan respuesta dan -1.
 */
export function urgenciaDe(c: ChatParaOrdenar, ahora = Date.now()): number {
  if (!c.esperandoDesde) return -1;
  const espera = Math.max(0, (ahora - new Date(c.esperandoDesde).getTime()) / 60_000);
  const plazo = plazoDe(c.grupo ?? "consulta", c.vip) ?? PLAZO_SIN_PLAZO_MIN;
  return espera / plazo;
}

/** Ordena por urgencia: los que esperan primero (el plazo más gastado arriba; a igual urgencia, el que más espera), luego los demás por su último mensaje. No cambia la lista original. */
export function ordenarPorUrgencia<T extends ChatParaOrdenar>(chats: readonly T[], ahora = Date.now()): T[] {
  const u = new Map(chats.map((c) => [c, urgenciaDe(c, ahora)]));
  return [...chats].sort((a, b) => {
    const d = (u.get(b) ?? -1) - (u.get(a) ?? -1);
    if (d !== 0) return d;
    if (a.esperandoDesde && b.esperandoDesde) return a.esperandoDesde.localeCompare(b.esperandoDesde);
    return (b.ultimoMensajeEn ?? "").localeCompare(a.ultimoMensajeEn ?? "");
  });
}

// ——— El tablero de la bandeja: columnas por estado (30 oct 2026, pedido de Hernán; bosquejo https://claude.ai/artifact/WhfJpQZQf6AdvSxsmzfZFa, opción B) ———
// Antes (29 oct) eran niveles de urgencia (Alta, Media, Baja y Contestados). Ahora cada chat va solo según lo que pasa con él: escribe el cliente →
// «Por atender»; le contestan → «En conversación»; se marca resuelto → «Cerrados». La urgencia (el plazo de su motivo) es el orden de «Por atender».

export type ColumnaTablero = "por_atender" | "en_conversacion" | "cerrados";

/** Las columnas del tablero, de izquierda a derecha, con lo que significa cada una. */
export const COLUMNAS_TABLERO: { id: ColumnaTablero; etiqueta: string; detalle: string }[] = [
  { id: "por_atender", etiqueta: "Por atender", detalle: "El cliente escribió y nadie le ha contestado" },
  { id: "en_conversacion", etiqueta: "En conversación", detalle: "Le contestamos: esperamos su respuesta" },
  { id: "cerrados", etiqueta: "Cerrados", detalle: "Resueltos en las últimas 24 h" },
];

/** Hasta cuántas horas después del último mensaje sigue un chat contestado en «En conversación» (después sale del tablero, sigue en la lista). */
export const HORAS_EN_CONVERSACION = 48;
/** Hasta cuántas horas después del último mensaje sigue un chat resuelto en «Cerrados». */
export const HORAS_CERRADOS = 24;

export interface ChatParaTablero extends ChatParaOrdenar {
  resuelta: boolean;
}

/**
 * La columna de un chat en el tablero, o null si ya no va. El que espera respuesta va a «Por atender» (aunque estuviera resuelto: si el cliente vuelve a
 * escribir, vuelve a empezar); el contestado, a «En conversación» hasta `HORAS_EN_CONVERSACION`; el resuelto, a «Cerrados» hasta `HORAS_CERRADOS`.
 */
export function columnaDelChat(c: ChatParaTablero, ahora = Date.now()): ColumnaTablero | null {
  if (c.esperandoDesde) return "por_atender";
  const hace = ahora - (c.ultimoMensajeEn ? new Date(c.ultimoMensajeEn).getTime() : 0);
  if (c.resuelta) return hace <= HORAS_CERRADOS * 3_600_000 ? "cerrados" : null;
  return hace <= HORAS_EN_CONVERSACION * 3_600_000 ? "en_conversacion" : null;
}

/** Los chats repartidos en las columnas del tablero: «Por atender» por urgencia (lo vencido arriba), las demás con lo más reciente arriba. No cambia la lista original. */
export function repartirTablero<T extends ChatParaTablero>(chats: readonly T[], ahora = Date.now()): Record<ColumnaTablero, T[]> {
  const columnas: Record<ColumnaTablero, T[]> = { por_atender: [], en_conversacion: [], cerrados: [] };
  for (const c of ordenarPorUrgencia(chats, ahora)) {
    const columna = columnaDelChat(c, ahora);
    if (columna) columnas[columna].push(c);
  }
  return columnas;
}

/** Cómo se dice un plazo: «15 min», «1 h 30 min», «4 h», «2 días». */
export const textoPlazo = (min: number): string =>
  min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${Math.floor(min / 1440)} día${min >= 2880 ? "s" : ""}`;

// ——— Lo que se le pide a la IA ———

/** Cuántos mensajes del final del chat se le pasan a la IA. */
export const MENSAJES_PARA_MOTIVO = 12;
/** Cuántas correcciones del equipo van de ejemplo. */
export const EJEMPLOS_DE_CORRECCION = 12;
export const MAX_RESUMEN_MOTIVO = 140;

export interface CorreccionEjemplo {
  texto: string;
  grupo: GrupoMotivo;
}

export function pedidoMotivo(mensajes: readonly MensajeActividad[], correcciones: readonly CorreccionEjemplo[] = []): { instrucciones: string; texto: string } {
  const grupos = GRUPOS.map((g) => `- ${g.id}: ${g.etiqueta}`).join("\n");
  const motivos = MOTIVOS.map((m) => `- ${m.id}: ${m.etiqueta}`).join("\n");
  const ejemplos = correcciones.slice(0, EJEMPLOS_DE_CORRECCION).map((c) => `- Cliente: «${c.texto}» → ${c.grupo}`);
  return {
    instrucciones: [
      "Eres quien ordena la bandeja de WhatsApp de atención al cliente de una empresa de dropshipping (Ecomfive). Los clientes son dropshippers que venden sus productos.",
      "Te paso los últimos mensajes de un chat. Di por qué escribe el cliente AHORA (lo que espera que el equipo le conteste), para saber qué tan rápido hay que responderle.",
      `Grupo (elige uno):\n${grupos}`,
      "Una queja o reclamo es cuando el cliente está molesto o reclama por algo que salió mal (un producto dañado, un mal servicio, algo que se le prometió y no pasó). Si solo pregunta por su pedido, es «pedido».",
      `Motivo específico (elige uno de estos ids):\n${motivos}`,
      ...(ejemplos.length ? [`El equipo corrigió estos casos; úsalos como guía:\n${ejemplos.join("\n")}`] : []),
      `"molesto": true solo si el cliente se nota enojado, frustrado o amenaza con irse. "resumen": por qué escribe, en una frase corta en español, sin datos personales, de ${MAX_RESUMEN_MOTIVO} letras como máximo.`,
      'Responde SOLO con JSON, sin texto antes ni después: {"grupo":"pedido","motivo":"estado_guia","molesto":false,"resumen":"..."}',
    ].join("\n\n"),
    texto: mensajes
      .slice(-MENSAJES_PARA_MOTIVO)
      .map((m) => `${m.direccion === "entrante" ? "Cliente" : "Equipo"}: ${textoParaIA(m)}`)
      .join("\n"),
  };
}

export interface MotivoDelChat {
  grupo: GrupoMotivo;
  motivo: string | null;
  molesto: boolean;
  resumen: string;
}

const ID_MOTIVOS = new Set(MOTIVOS.map((m) => m.id));

/** Lo que devolvió la IA, validado. Si el grupo no sirve se toma el del motivo; si el cliente está molesto, es una queja. Sin JSON útil, null. */
export function normalizarMotivo(texto: string): MotivoDelChat | null {
  const i = texto.indexOf("{");
  const j = texto.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(texto.slice(i, j + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const motivo = typeof o.motivo === "string" && ID_MOTIVOS.has(o.motivo) ? o.motivo : null;
  const molesto = o.molesto === true;
  if (!esGrupo(o.grupo) && !motivo) return null;
  const grupo: GrupoMotivo = molesto ? "queja" : esGrupo(o.grupo) ? o.grupo : grupoDeMotivo(motivo);
  const resumen = (typeof o.resumen === "string" ? o.resumen : "").replace(/\s+/g, " ").trim().slice(0, MAX_RESUMEN_MOTIVO);
  return { grupo, motivo, molesto, resumen };
}

export interface EstadoMotivo {
  esperandoDesde: string | null;
  ultimoEntranteEn: string | null;
  motivoGrupo: string | null;
  motivoPor: "ia" | "persona" | null;
  motivoEn: string | null;
  motivoPedidoEn: string | null;
}

/** Cada cuánto como mucho se vuelve a leer un chat que ya tiene motivo de la IA y sigue recibiendo mensajes. */
export const RELEER_CADA_MS = 2 * 60_000;
/** Un pedido a la IA en curso: no se pide otro durante este tiempo. */
export const PEDIDO_EN_CURSO_MS = 60_000;

/**
 * Si hay que pedirle a la IA el motivo de un chat: solo si el cliente espera respuesta y hay algo nuevo que leer. Lo que puso una persona se respeta mientras el cliente siga esperando por
 * lo mismo (hasta que el equipo le conteste y vuelva a escribir). Un motivo de la IA se vuelve a leer con mensajes nuevos, como mucho cada `RELEER_CADA_MS` (siempre si era un saludo).
 */
export function hayQueClasificar(c: EstadoMotivo, ahora = Date.now()): boolean {
  if (!c.esperandoDesde) return false;
  if (c.motivoPedidoEn && ahora - new Date(c.motivoPedidoEn).getTime() < PEDIDO_EN_CURSO_MS) return false;
  if (!c.motivoGrupo || !c.motivoEn) return true;
  const motivoEn = new Date(c.motivoEn).getTime();
  // De una espera anterior: el cliente volvió a escribir después de que se le contestó.
  if (motivoEn < new Date(c.esperandoDesde).getTime()) return true;
  if (c.motivoPor === "persona") return false;
  const hayNuevo = !!c.ultimoEntranteEn && new Date(c.ultimoEntranteEn).getTime() > motivoEn;
  if (!hayNuevo) return false;
  return c.motivoGrupo === "otro" || ahora - motivoEn >= RELEER_CADA_MS;
}
