// Fotos, videos y documentos por WhatsApp (28 oct 2026, migración 0170). Qué se puede mandar se decide por el contenido del archivo
// (sus primeros bytes), no por el nombre ni por lo que dice el navegador. Sin base ni red, para poder probarlo: whatsapp.test.ts.
import { detectarAdjunto } from "@/lib/compras/adjuntos";

export const BUCKET_WHATSAPP = "whatsapp";

/** Lo que WhatsApp acepta de cada tipo (límites de Meta). */
export const MAX_BYTES_WHATSAPP = { image: 5 * 1024 * 1024, video: 16 * 1024 * 1024, document: 100 * 1024 * 1024 } as const;

/** Lo que el selector de archivos de la bandeja deja elegir (igual se revisa el contenido en el servidor). */
export const ACEPTAR_WHATSAPP = "image/jpeg,image/png,video/mp4,video/3gpp,.pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.csv,.txt";

export interface ArchivoWhatsapp {
  /** El tipo de mensaje de WhatsApp. */
  tipoWa: "image" | "video" | "document";
  /** El tipo en el sistema (`whatsapp_mensajes.tipo`). */
  tipo: "imagen" | "video" | "documento";
  mime: string;
  extension: string;
}

const ascii = (bytes: Uint8Array, desde: number, largo: number) => String.fromCharCode(...bytes.slice(desde, desde + largo));

/**
 * El tipo real de un archivo para mandarlo por WhatsApp, o el motivo por el que no se puede. Fotos: JPG o PNG (WhatsApp no manda
 * WebP ni GIF como foto). Videos: MP4 o 3GP (WhatsApp pide H.264 con audio AAC; eso no se puede ver aquí y, si no lo es, WhatsApp
 * avisa el error). Un MOV de iPhone no sirve: hay que exportarlo como MP4. Documentos: PDF, Office, CSV y texto.
 */
export function detectarArchivoWhatsapp(bytes: Uint8Array, nombre: string): ArchivoWhatsapp | { error: string } {
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const marca = ascii(bytes, 8, 4);
    if (marca === "qt  ") return { error: "Los videos .MOV no se pueden mandar por WhatsApp: expórtalo como MP4." };
    if (marca.startsWith("3g")) return { tipoWa: "video", tipo: "video", mime: "video/3gpp", extension: "3gp" };
    if (/^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |M4VP|dash|MSNV|f4v )$/.test(marca)) return { tipoWa: "video", tipo: "video", mime: "video/mp4", extension: "mp4" };
    return { error: "Ese video no tiene un formato que WhatsApp acepte (MP4)." };
  }
  const adjunto = detectarAdjunto(bytes, nombre);
  if (adjunto?.clase === "foto") {
    if (adjunto.tipo === "image/jpeg" || adjunto.tipo === "image/png") return { tipoWa: "image", tipo: "imagen", mime: adjunto.tipo, extension: adjunto.extension };
    return { error: "Por WhatsApp las fotos van en JPG o PNG." };
  }
  if (adjunto) return { tipoWa: "document", tipo: "documento", mime: adjunto.tipo.split(";")[0], extension: adjunto.extension };
  return { error: "Se pueden mandar fotos (JPG, PNG), videos (MP4) y documentos (PDF, Excel, Word, PowerPoint, CSV, texto)." };
}

/** El motivo si el archivo pesa más de lo que WhatsApp acepta para su tipo, o null. */
export function excedeTamano(tipoWa: ArchivoWhatsapp["tipoWa"], bytes: number): string | null {
  const max = MAX_BYTES_WHATSAPP[tipoWa];
  if (bytes <= max) return null;
  const mb = Math.round(max / 1024 / 1024);
  return tipoWa === "image" ? `Por WhatsApp las fotos pesan hasta ${mb} MB.` : tipoWa === "video" ? `Por WhatsApp los videos pesan hasta ${mb} MB: recórtalo o comprímelo.` : `Por WhatsApp los documentos pesan hasta ${mb} MB.`;
}

/** La extensión para guardar un archivo que llegó, según su tipo (lo dice Meta); `bin` si no se reconoce. */
export function extensionDeMime(mime: string | null): string {
  const t = String(mime ?? "").split(";")[0].trim().toLowerCase();
  const conocidas: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "audio/aac": "aac", "audio/amr": "amr", "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf",
  };
  return conocidas[t] ?? "bin";
}
