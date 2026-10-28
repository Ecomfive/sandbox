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

/** Lo que trae un mensaje de Meta (texto, tipo y archivo), sea uno que llega o uno mandado desde el celular. */
function contenidoDe(m: Obj): Pick<MensajeEntrante, "tipo" | "texto" | "mediaId" | "mediaMime" | "mediaNombre"> {
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
  return {
    tipo: TIPOS[tipoMeta] ?? "otro",
    texto: contenido,
    mediaId: conArchivo ? texto(cuerpo.id) : null,
    mediaMime: conArchivo ? texto(cuerpo.mime_type) : null,
    mediaNombre: tipoMeta === "document" ? texto(cuerpo.filename) : null,
  };
}

/**
 * Los mensajes que llegan, los estados de los mandados y los «ecos» de un aviso del webhook (lo que no se entiende se ignora).
 * Un eco (campo `smb_message_echoes`, coexistencia: el número sigue en la app WhatsApp Business del celular) es un mensaje que el
 * equipo mandó desde el celular; su `telefono` es el del dropshipper (a quien se le mandó).
 * Con `sinMetadata` (avisos de 360dialog, que llegan por su propia dirección): se aceptan sin `object` y, si no traen el número de la
 * empresa (el sandbox no lo manda), se usa ese id. Quien escribe sin teléfono compartido llega con su id de usuario (`from_user_id`).
 */
export function extraerAviso(aviso: unknown, sinMetadata?: string): { mensajes: MensajeEntrante[]; estados: EstadoEntrante[]; ecos: MensajeEntrante[] } {
  const mensajes: MensajeEntrante[] = [];
  const estados: EstadoEntrante[] = [];
  const ecos: MensajeEntrante[] = [];
  if (obj(aviso).object !== "whatsapp_business_account" && !(sinMetadata && obj(aviso).object === undefined)) return { mensajes, estados, ecos };
  for (const entrada of lista(obj(aviso).entry)) {
    for (const cambio of lista(obj(entrada).changes)) {
      const campo = obj(cambio).field;
      if (campo !== "messages" && campo !== "smb_message_echoes") continue;
      const valor = obj(obj(cambio).value);
      const meta = obj(valor.metadata);
      const phoneNumberId = texto(meta.phone_number_id) ?? sinMetadata ?? null;
      if (!phoneNumberId) continue;
      const numeroEmpresa = conMas(texto(meta.display_phone_number));
      if (campo === "smb_message_echoes") {
        for (const m of lista(valor.message_echoes).map(obj)) {
          const para = texto(m.to);
          const waId = texto(m.id);
          if (!para || !waId) continue;
          ecos.push({ phoneNumberId, numeroEmpresa, telefono: conMas(para)!, nombre: null, waId, ...contenidoDe(m), momento: momentoDe(m.timestamp) });
        }
        continue;
      }
      const nombres = new Map(lista(valor.contacts).map((c) => [String(obj(c).wa_id ?? obj(c).user_id ?? ""), texto(obj(obj(c).profile).name)]));
      for (const m of lista(valor.messages).map(obj)) {
        const de = texto(m.from);
        // Sin teléfono compartido (BSUID): se guarda el id tal cual y se le responde con `recipient` (ver api.ts).
        const usuario = de ? null : texto(m.from_user_id);
        const waId = texto(m.id);
        if ((!de && !usuario) || !waId) continue;
        const telefono = de ? conMas(de)! : usuario!;
        mensajes.push({ phoneNumberId, numeroEmpresa, telefono, nombre: nombres.get((de ?? usuario)!) ?? null, waId, ...contenidoDe(m), momento: momentoDe(m.timestamp) });
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
  return { mensajes, estados, ecos };
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
