// WhatsApp directo al sistema (26 oct 2026): lo que trae cada aviso del webhook de WhatsApp Cloud API. Un aviso puede traer mensajes
// que llegan (de un dropshipper a un número de la empresa) y estados de los que mandó el equipo (enviado, entregado, leído, fallido).
// Sin base ni red, para poder probarlo: src/lib/whatsapp/whatsapp.test.ts.

export interface MensajeEntrante {
  /** El número de la empresa que recibió el mensaje (su id en Meta y cómo se ve: «+50760000000»). */
  phoneNumberId: string;
  numeroEmpresa: string | null;
  /** El WhatsApp de quien escribe, en formato internacional («+50761112233»). */
  telefono: string;
  /** El nombre de su perfil de WhatsApp. */
  nombre: string | null;
  waId: string;
  tipo: string;
  /** El texto, o el pie de la foto o del documento; null si no trae. */
  texto: string | null;
  mediaId: string | null;
  mediaMime: string | null;
  mediaNombre: string | null;
  /** ISO. */
  momento: string;
}

export type EstadoMensaje = "enviado" | "entregado" | "leido" | "fallido";

export interface EstadoEntrante {
  waId: string;
  estado: EstadoMensaje;
  momento: string;
  error: string | null;
}

const ESTADOS: Record<string, EstadoMensaje> = { sent: "enviado", delivered: "entregado", read: "leido", failed: "fallido" };

/** El orden de los estados de un mensaje mandado: uno nunca vuelve atrás (un «entregado» que llega tarde no tapa un «leído»). */
export const ORDEN_ESTADO = ["enviando", "enviado", "entregado", "leido"] as const;

const TIPOS: Record<string, string> = {
  text: "texto", image: "imagen", audio: "audio", voice: "audio", video: "video", document: "documento", sticker: "sticker",
  location: "ubicacion", reaction: "reaccion", button: "texto", interactive: "texto", contacts: "contacto",
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const momentoDe = (segundos: unknown): string => {
  const n = Number(segundos);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
};
const conMas = (n: string | null): string | null => (n ? (n.startsWith("+") ? n : `+${n.replace(/\D/g, "")}`) : null);

/** Los mensajes que llegan y los estados de los mandados, de un aviso del webhook (lo que no se entiende se ignora). */
export function extraerAviso(aviso: unknown): { mensajes: MensajeEntrante[]; estados: EstadoEntrante[] } {
  const mensajes: MensajeEntrante[] = [];
  const estados: EstadoEntrante[] = [];
  if (obj(aviso).object !== "whatsapp_business_account") return { mensajes, estados };
  for (const entrada of lista(obj(aviso).entry)) {
    for (const cambio of lista(obj(entrada).changes)) {
      if (obj(cambio).field !== "messages") continue;
      const valor = obj(obj(cambio).value);
      const meta = obj(valor.metadata);
      const phoneNumberId = texto(meta.phone_number_id);
      if (!phoneNumberId) continue;
      const nombres = new Map(lista(valor.contacts).map((c) => [String(obj(c).wa_id ?? ""), texto(obj(obj(c).profile).name)]));
      for (const m of lista(valor.messages).map(obj)) {
        const de = texto(m.from);
        const waId = texto(m.id);
        if (!de || !waId) continue;
        const tipoMeta = String(m.type ?? "");
        const cuerpo = obj(m[tipoMeta]);
        let contenido: string | null = null;
        if (tipoMeta === "text") contenido = texto(obj(m.text).body);
        else if (tipoMeta === "button") contenido = texto(obj(m.button).text);
        else if (tipoMeta === "interactive") contenido = texto(obj(cuerpo.button_reply).title) ?? texto(obj(cuerpo.list_reply).title);
        else if (tipoMeta === "reaction") contenido = texto(cuerpo.emoji);
        else if (tipoMeta === "location")
          contenido = [texto(cuerpo.name), texto(cuerpo.address), cuerpo.latitude !== undefined ? `${cuerpo.latitude}, ${cuerpo.longitude}` : null].filter(Boolean).join(" · ") || null;
        else contenido = texto(cuerpo.caption);
        const conArchivo = ["image", "audio", "voice", "video", "document", "sticker"].includes(tipoMeta);
        mensajes.push({
          phoneNumberId,
          numeroEmpresa: conMas(texto(meta.display_phone_number)),
          telefono: conMas(de)!,
          nombre: nombres.get(de) ?? null,
          waId,
          tipo: TIPOS[tipoMeta] ?? "otro",
          texto: contenido,
          mediaId: conArchivo ? texto(cuerpo.id) : null,
          mediaMime: conArchivo ? texto(cuerpo.mime_type) : null,
          mediaNombre: tipoMeta === "document" ? texto(cuerpo.filename) : null,
          momento: momentoDe(m.timestamp),
        });
      }
      for (const s of lista(valor.statuses).map(obj)) {
        const waId = texto(s.id);
        const estado = ESTADOS[String(s.status ?? "")];
        if (!waId || !estado) continue;
        const e = obj(lista(s.errors)[0]);
        const detalle = texto(obj(e.error_data).details) ?? texto(e.message) ?? texto(e.title);
        estados.push({ waId, estado, momento: momentoDe(s.timestamp), error: estado === "fallido" ? (e.code !== undefined ? `${e.code}: ${detalle ?? "error"}` : (detalle ?? "No se pudo entregar.")) : null });
      }
    }
  }
  return { mensajes, estados };
}

const ETIQUETA_TIPO: Record<string, string> = {
  imagen: "Foto", audio: "Audio", video: "Video", documento: "Documento", sticker: "Sticker", ubicacion: "Ubicación",
  reaccion: "Reacción", contacto: "Contacto", plantilla: "Plantilla", otro: "Mensaje",
};

/** Lo que se ve de un mensaje en la lista de conversaciones: su texto o, si no trae, qué es («Foto», «Audio»). */
export function resumenMensaje(tipo: string, contenido: string | null): string {
  const t = (contenido ?? "").replace(/\s+/g, " ").trim();
  if (tipo === "texto") return t.slice(0, 160) || "Mensaje";
  const etiqueta = ETIQUETA_TIPO[tipo] ?? "Mensaje";
  return t ? `${etiqueta}: ${t}`.slice(0, 160) : etiqueta;
}
