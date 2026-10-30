// Transcribir un audio de WhatsApp (30 oct 2026, pedido de Jhokser): lo puro. La llamada a la IA está en `transcribir-ia.ts` (solo servidor).

/** Lo máximo que se manda a transcribir: el tope de lo que aceptan las dos IA (OpenAI 25 MB, Gemini 20 MB por pedido). */
export const MAX_BYTES_AUDIO = 20 * 1024 * 1024;
/** Lo más largo que se guarda de una transcripción (un audio de varios minutos cabe de sobra). */
export const MAX_LARGO_TRANSCRIPCION = 8000;

export interface FormatoAudio {
  extension: string;
  /** El tipo ya sin parámetros (`audio/ogg; codecs=opus` → `audio/ogg`). */
  mime: string;
}

/**
 * El formato de un audio que las IA aceptan (ogg/opus de las notas de voz, mp3, m4a/aac, wav, webm, flac) o `null`. El AMR de algunos celulares no se
 * puede transcribir: se dice y no se gasta crédito.
 */
export function formatoDeAudio(mime: string | null | undefined, nombre?: string | null): FormatoAudio | null {
  const tipo = String(mime ?? "").split(";")[0].trim().toLowerCase();
  const porTipo: Record<string, FormatoAudio> = {
    "audio/ogg": { extension: "ogg", mime: "audio/ogg" },
    "audio/opus": { extension: "ogg", mime: "audio/ogg" },
    "audio/mpeg": { extension: "mp3", mime: "audio/mpeg" },
    "audio/mp3": { extension: "mp3", mime: "audio/mpeg" },
    "audio/mp4": { extension: "m4a", mime: "audio/mp4" },
    "audio/x-m4a": { extension: "m4a", mime: "audio/mp4" },
    "audio/m4a": { extension: "m4a", mime: "audio/mp4" },
    "audio/aac": { extension: "m4a", mime: "audio/aac" },
    "audio/wav": { extension: "wav", mime: "audio/wav" },
    "audio/x-wav": { extension: "wav", mime: "audio/wav" },
    "audio/webm": { extension: "webm", mime: "audio/webm" },
    "audio/flac": { extension: "flac", mime: "audio/flac" },
  };
  if (porTipo[tipo]) return porTipo[tipo];
  // Sin tipo claro (un chat importado del celular), por la extensión del nombre.
  const ext = /\.([a-z0-9]{2,4})$/i.exec(String(nombre ?? ""))?.[1]?.toLowerCase();
  const porExtension: Record<string, FormatoAudio> = {
    ogg: porTipo["audio/ogg"],
    opus: porTipo["audio/ogg"],
    mp3: porTipo["audio/mpeg"],
    m4a: porTipo["audio/mp4"],
    aac: porTipo["audio/aac"],
    wav: porTipo["audio/wav"],
    webm: porTipo["audio/webm"],
    flac: porTipo["audio/flac"],
  };
  return ext ? (porExtension[ext] ?? null) : null;
}

/** La transcripción lista para guardar: sin espacios de más, con a lo sumo un renglón vacío seguido y con tope. Vacía = no se entendió nada. */
export function limpiarTranscripcion(texto: unknown): string {
  const limpio = String(texto ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return limpio.length > MAX_LARGO_TRANSCRIPCION ? `${limpio.slice(0, MAX_LARGO_TRANSCRIPCION).trimEnd()}…` : limpio;
}

/** La instrucción para la IA que no es de transcripción (Gemini): el texto tal cual se dijo, sin resumir ni agregar nada. */
export const PEDIDO_TRANSCRIPCION =
  "Transcribe este mensaje de voz de WhatsApp, enviado por un cliente a una tienda en línea, tal como se dice (en el idioma en que está hablado, normalmente español). " +
  "Escribe solo lo que se dice, con puntuación natural: no lo resumas, no lo traduzcas, no agregues comentarios ni títulos. Si no se entiende nada, responde exactamente: [sin voz]";

/** Lo que la IA responde cuando no hay nada que transcribir. */
export const SIN_VOZ = "[sin voz]";
