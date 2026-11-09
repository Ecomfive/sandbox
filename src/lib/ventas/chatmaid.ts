import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaisOp } from "@/lib/ventas/operacion";
import { PLANTILLAS, type PlantillaAviso } from "@/lib/ventas/chatmaid-plantillas";

/** Cliente de Chatmaid (WhatsApp) y reglas puras de los avisos del pedido. La clave vive solo en el servidor. */
export const CHATMAID_URL = "https://developers-api.chatmaid.net";
const PREFIJO: Record<PaisOp, string> = { PA: "507", CR: "506", MX: "52" };

/** Teléfono local (clave normalizada) → E.164 con «+» y prefijo del país. */
export function aE164(pais: PaisOp, clave: string): string | null {
  const d = (clave ?? "").replace(/\D/g, "");
  if (!d) return null;
  return `+${PREFIJO[pais]}${d}`;
}

export { PLANTILLAS, type PlantillaAviso };

export interface DatosAviso { nombre?: string | null; tienda: string; numero: string; productos: string; total?: number | null; guia?: string | null; con?: string | null; fechaPrometida?: string | null }

const primerNombre = (n?: string | null) => (n ?? "").trim().split(/\s+/)[0] || "";
const saludo = (d: DatosAviso) => (primerNombre(d.nombre) ? `Hola ${primerNombre(d.nombre)}` : "Hola");

/** Texto de cada aviso (puro: no lleva datos que no sean del pedido). */
export function textoAviso(p: PlantillaAviso, d: DatosAviso): string {
  const ped = `tu pedido ${d.numero} de ${d.tienda}`;
  switch (p) {
    case "confirmar":
      return `${saludo(d)}, recibimos ${ped} (${d.productos}${d.total ? `, total $${d.total.toFixed(2)}` : ""}). Responde 1 para confirmarlo o 2 para cancelarlo.`;
    case "confirmada":
      return `${saludo(d)}, confirmamos ${ped}. Te avisamos cuando salga a entrega.`;
    case "despachada":
      return `${saludo(d)}, ${ped} ya salió a entrega${d.con ? ` con ${d.con}` : ""}${d.fechaPrometida ? ` y se espera para el ${d.fechaPrometida}` : ""}. Ten el pago listo si es contra entrega.`;
    case "guia":
      return d.guia ? `${saludo(d)}, la guía de ${ped} es ${d.guia}${d.con ? ` (${d.con})` : ""}.` : `${saludo(d)}, aún no hay guía de ${ped}.`;
    case "fallida":
      return `${saludo(d)}, no pudimos entregar ${ped}. Responde con el día que te acomoda para volver a intentarlo.`;
    case "entregada":
      return `${saludo(d)}, ${ped} fue entregado. ¡Gracias por tu compra!`;
  }
}

/** Respuesta del cliente al pedir confirmación: 1/sí → confirma; 2/no → cancela; otra cosa → ninguna. */
export function interpretarRespuesta(texto: string | null | undefined): "confirma" | "cancela" | null {
  const t = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").trim();
  if (!t) return null;
  const palabras = t.split(/\s+/);
  if (palabras.length > 4) return null;
  if (/^(1|si|ok|okay|confirmo|confirmado|dale|claro|listo)$/.test(palabras[0]) && !palabras.includes("no")) return "confirma";
  if (/^(2|no|cancelar|cancelo|cancela|cancelado)$/.test(palabras[0])) return "cancela";
  return null;
}

/** Firma de los webhooks: `t=<ts>,v1=<hex>` con HMAC-SHA256 de `ts + "." + cuerpo`. Rechaza más de 5 minutos de diferencia. */
export function firmaChatmaidValida(cuerpo: string, cabecera: string | null, secreto: string | undefined, ahoraMs = Date.now()): boolean {
  if (!secreto || !cabecera) return false;
  const partes = Object.fromEntries(cabecera.split(",").map((x) => x.trim().split("=") as [string, string]));
  const ts = partes.t;
  const v1 = partes.v1;
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]+$/i.test(v1)) return false;
  const tsMs = ts.length <= 11 ? Number(ts) * 1000 : Number(ts);
  if (Math.abs(ahoraMs - tsMs) > 5 * 60_000) return false;
  const esperado = createHmac("sha256", secreto).update(`${ts}.${cuerpo}`).digest("hex");
  const a = Buffer.from(esperado, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type EstadoMensaje = "pendiente" | "enviado" | "entregado" | "leido" | "fallido" | "recibido";
const ORDEN: EstadoMensaje[] = ["pendiente", "enviado", "entregado", "leido"];
/** Un estado nunca retrocede (un «enviado» tardío no pisa un «leído»); «fallido» siempre manda. */
export function estadoSiguiente(actual: EstadoMensaje, nuevo: EstadoMensaje): EstadoMensaje {
  if (nuevo === "fallido") return actual === "leido" || actual === "entregado" ? actual : "fallido";
  const a = ORDEN.indexOf(actual), n = ORDEN.indexOf(nuevo);
  return a < 0 || n < 0 ? nuevo : n > a ? nuevo : actual;
}
export const ESTADO_DE_EVENTO: Record<string, EstadoMensaje> = { "message.sent": "enviado", "message.delivered": "entregado", "message.read": "leido", "message.failed": "fallido" };

export function chatmaidConfigurado(pais: PaisOp): { clave: string; desde: string } | null {
  const clave = process.env.CHATMAID_API_KEY;
  const desde = process.env[`CHATMAID_DESDE_${pais}`] ?? process.env.CHATMAID_DESDE;
  return clave && desde ? { clave, desde } : null;
}

export async function enviarChatmaid(cfg: { clave: string; desde: string }, para: string, contenido: string, idempotencyKey: string): Promise<{ ok: true; id: string; estado: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${CHATMAID_URL}/v1/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fromPhoneId: cfg.desde, to: para, content: contenido.slice(0, 4096), idempotencyKey: idempotencyKey.slice(0, 64) }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => null)) as { success?: boolean; data?: { id?: string; status?: string }; error?: unknown; message?: string } | null;
    if (!r.ok || !j?.success || !j.data?.id) {
      const motivo = r.status === 401 ? "Chatmaid rechazó la clave." : r.status === 403 ? "La clave no tiene permiso para enviar." : r.status === 429 ? "Chatmaid pide esperar un momento (límite de envíos)." : typeof j?.message === "string" ? j.message : `Chatmaid respondió ${r.status}.`;
      return { ok: false, error: motivo };
    }
    return { ok: true, id: j.data.id, estado: j.data.status ?? "pendiente" };
  } catch {
    return { ok: false, error: "No se pudo contactar a Chatmaid." };
  }
}
