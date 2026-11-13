// Chat de WhatsApp del cliente de tienda con iComfly (13 nov 2026): lo que viene del conector de iComfly, ordenado y con nombres nuestros. Sin red ni base, con prueba
// (`chat-tienda.test.ts`). La lectura y los envíos están en `chat-tienda-datos.ts`.

export type QuienChat = "cliente" | "bot" | "equipo";

export interface MensajeChat {
  id: number;
  conversacionId: number | null;
  de: QuienChat;
  /** text, template, image, audio, video, document… */
  tipo: string;
  texto: string;
  /** sent, delivered, read, failed… */
  estado: string | null;
  mediaUrl: string | null;
  mediaTipo: string | null;
  transcripcion: string | null;
  /** Cuándo lo vio el sistema (iComfly no da la fecha: ver la migración 0285); null si no se sabe. */
  vistoEn: string | null;
  /** Quién del equipo lo mandó desde el sistema. */
  autor: string | null;
}

type Obj = Record<string, unknown>;
const txt = (v: unknown) =>
  typeof v === "string" ? v : v == null ? "" : String(v);
const entero = (v: unknown) =>
  Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null;

/** De quién es un mensaje de iComfly: lo que entra es del cliente; lo que sale, del bot o de una persona. */
export function quienDe(m: {
  direction?: unknown;
  sender_type?: unknown;
}): QuienChat {
  if (txt(m.direction) === "inbound") return "cliente";
  const s = txt(m.sender_type).toLowerCase();
  return s === "bot" ||
    s === "ai" ||
    s === "assistant" ||
    s === "flow" ||
    s === "system" ||
    s === "automation"
    ? "bot"
    : "equipo";
}

/** Los mensajes de `ver_conversacion_whatsapp`, del más viejo al más nuevo (por su id: iComfly no da la fecha). */
export function mensajesDeIcomfly(datos: unknown): MensajeChat[] {
  const lista = Array.isArray((datos as { mensajes?: unknown })?.mensajes)
    ? ((datos as { mensajes: unknown[] }).mensajes as Obj[])
    : [];
  return lista
    .filter((m) => entero(m.id) !== null)
    .map((m) => ({
      id: entero(m.id)!,
      conversacionId: entero(m.conversation_id),
      de: quienDe(m),
      tipo: txt(m.message_type) || "text",
      texto: txt(m.content),
      estado: txt(m.status) || null,
      mediaUrl: txt(m.media_url) || null,
      mediaTipo: txt(m.media_type) || null,
      transcripcion: txt(m.transcripcion) || null,
      vistoEn: null,
      autor: null,
    }))
    .sort((a, b) => a.id - b.id);
}

/** Les pone a los mensajes cuándo los vio el sistema y quién los mandó desde aquí. */
export function conLoNuestro(
  mensajes: MensajeChat[],
  nuestros: Map<number, { vistoEn: string | null; autor: string | null }>,
): MensajeChat[] {
  return mensajes.map((m) => {
    const n = nuestros.get(m.id);
    return n ? { ...m, vistoEn: n.vistoEn || null, autor: n.autor } : m;
  });
}

/** El código de país para WhatsApp (Panamá 507, Costa Rica 506…). */
const PREFIJO: Record<string, string> = {
  PA: "507",
  CR: "506",
  MX: "52",
  CO: "57",
  HN: "504",
  GT: "502",
  SV: "503",
  NI: "505",
  EC: "593",
  VE: "58",
};

/**
 * El teléfono como lo pide iComfly: solo dígitos, con el código del país («50768481958»). Un número local de Panamá o Costa Rica (8 dígitos) toma el código
 * del país del pedido; uno que ya trae el código se deja. null si no parece un teléfono.
 */
export function telefonoParaIcomfly(
  telefono: string | null | undefined,
  codigoPais: string,
): string | null {
  let d = String(telefono ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 7) return null;
  const prefijo = PREFIJO[codigoPais.toUpperCase()] ?? "";
  if (prefijo && d.startsWith(prefijo) && d.length > prefijo.length + 6)
    return d;
  if (prefijo && (d.length === 7 || d.length === 8)) return `${prefijo}${d}`;
  return d.length >= 10 ? d : null;
}

/** Los 4 últimos dígitos de un teléfono (el del pedido, o el oculto de iComfly: «•••••••5732»); null si no tiene. */
export function colaTelefono(v: string | null | undefined): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : null;
}

const palabras = (t: string | null | undefined) =>
  new Set(
    String(t ?? "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 3),
  );

/** Un chat de iComfly con mensajes pendientes: los 4 dígitos que deja ver, el nombre del contacto y cuántos. */
export interface ChatPendiente {
  cola: string;
  nombre: string;
  cuenta: number;
}

/**
 * El numerito de WhatsApp de cada pedido de la lista (13 nov 2026, pedido de Hernán). iComfly da el número oculto, así que un chat va con los pedidos cuyo
 * teléfono termina en esos 4 dígitos Y cuyo cliente comparte una palabra del nombre con el contacto (Hernán: que coincidan los dos). Si el nombre no coincide
 * («prd», «🙂»), ninguno: mejor sin numerito que en el cliente equivocado. Un mismo cliente con varios pedidos lo lleva en todos.
 */
export function pendientesPorPedido(filas: { id: string; cliente: string | null; colaTel?: string | null }[], chats: ChatPendiente[]): Record<string, number> {
  const porCola = new Map<string, { id: string; cliente: string | null }[]>();
  for (const f of filas) if (f.colaTel) porCola.set(f.colaTel, [...(porCola.get(f.colaTel) ?? []), f]);
  const res: Record<string, number> = {};
  for (const ch of chats) {
    if (!(ch.cuenta > 0)) continue;
    const delContacto = palabras(ch.nombre);
    if (!delContacto.size) continue;
    for (const f of porCola.get(ch.cola) ?? []) if ([...palabras(f.cliente)].some((w) => delContacto.has(w))) res[f.id] = Math.max(res[f.id] ?? 0, ch.cuenta);
  }
  return res;
}

/**
 * La ventana de 24 horas de WhatsApp: dentro de ella se escribe libre; fuera, solo plantillas. Con lo que se sabe: si el último mensaje del cliente se vio
 * hace menos de 24 h, abierta; si se vio hace más, cerrada; si no se sabe cuándo (iComfly no da la fecha), «sin_saber» (se deja escribir y, si WhatsApp lo
 * rechaza, se pide una plantilla).
 */
export function ventana24(
  mensajes: MensajeChat[],
  ahora: number,
): "abierta" | "cerrada" | "sin_saber" {
  const ultimo = [...mensajes].reverse().find((m) => m.de === "cliente");
  if (!ultimo) return "cerrada";
  if (!ultimo.vistoEn) return "sin_saber";
  return ahora - Date.parse(ultimo.vistoEn) < 24 * 3_600_000
    ? "abierta"
    : "cerrada";
}

/** Si un error de iComfly al mandar texto es por la ventana de 24 h (entonces hace falta una plantilla). */
export const esErrorDeVentana = (error: string) =>
  /24 ?h|ventana|window|re-?engagement|131047|fuera de la ventana|plantilla/i.test(
    error,
  );

/** Las variables de una plantilla ({{1}}, {{2}}…) en orden, sin repetir. */
export function variablesDePlantilla(cuerpo: string): number[] {
  return [
    ...new Set(
      [...cuerpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])),
    ),
  ].sort((a, b) => a - b);
}

/** El cuerpo de una plantilla con sus variables puestas (lo que verá el cliente). */
export function rellenarPlantilla(cuerpo: string, valores: string[]): string {
  return cuerpo.replace(
    /\{\{\s*(\d+)\s*\}\}/g,
    (_, n) => valores[Number(n) - 1] || `{{${n}}}`,
  );
}
