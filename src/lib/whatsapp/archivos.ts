// Archivos que se mandan por WhatsApp desde la bandeja (29 oct 2026): fotos, audios, video y documentos. Aquí se decide, **por el contenido del archivo** (nunca por su
// nombre ni por el tipo que diga el navegador), de qué clase es, con qué tipo se manda y si cumple lo que WhatsApp acepta. Lógica pura, con prueba.
//   Fotos:      JPG y PNG, hasta 5 MB.
//   Audios:     MP3, M4A/AAC, OGG con códec Opus (el de las notas de voz) y AMR, hasta 16 MB.
//   Video:      MP4 o 3GP, hasta 16 MB.
//   Documentos: PDF, Word, Excel, PowerPoint y texto, hasta 16 MB (el límite de WhatsApp es mayor; este es el que cabe cómodo en el servidor).

import { detectarImagen } from "@/lib/seguridad/imagen";

export type TipoEnvio = "imagen" | "audio" | "video" | "documento" | "sticker";

export interface ArchivoParaWhatsapp {
  tipo: TipoEnvio;
  /** El tipo con que se sube y se manda (lo pone el servidor). */
  mime: string;
}

const MB = 1024 * 1024;
export const LIMITE_ENVIO: Record<TipoEnvio, number> = { imagen: 5 * MB, audio: 16 * MB, video: 16 * MB, documento: 16 * MB, sticker: 500 * 1024 };
/** El tamaño más grande que se acepta subir (el de un audio, un video o un documento). */
export const MAX_BYTES_ENVIO = 16 * MB;

export const MENSAJE_NO_SOPORTADO =
  "No se puede mandar ese archivo por WhatsApp. Se aceptan fotos JPG o PNG, audios MP3, M4A, OGG (Opus) o AMR, video MP4 y documentos PDF, Word, Excel, PowerPoint o de texto.";

const ARTICULO: Record<TipoEnvio, string> = { imagen: "una foto", audio: "un audio", video: "un video", documento: "un documento", sticker: "un sticker" };
const ascii = (b: Uint8Array, desde: number, largo: number) => String.fromCharCode(...b.slice(desde, desde + largo));
const extensionDe = (nombre: string) => (/\.([a-z0-9]+)$/i.exec(nombre)?.[1] ?? "").toLowerCase();

const DOCUMENTOS: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};

function contiene(bytes: Uint8Array, texto: string): boolean {
  const aguja = [...texto].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - aguja.length; i++) {
    for (let j = 0; j < aguja.length; j++) if (bytes[i + j] !== aguja[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * La clase y el tipo de un archivo según sus bytes, o el motivo en palabras si WhatsApp no lo acepta. Revisa también el tamaño de su clase. `nombre` solo sirve para
 * distinguir un audio M4A de un video MP4 (los dos son el mismo contenedor) y un Word o Excel viejo de otro.
 */
export function detectarArchivoWhatsapp(bytes: Uint8Array, nombre: string): ArchivoParaWhatsapp | { error: string } {
  const resultado = clasificar(bytes, nombre);
  if ("error" in resultado) return resultado;
  if (bytes.length === 0) return { error: "El archivo está vacío." };
  const limite = LIMITE_ENVIO[resultado.tipo];
  if (bytes.length > limite) return { error: `Ese archivo pesa más de ${limite / MB} MB, que es lo máximo para ${ARTICULO[resultado.tipo]} por WhatsApp.` };
  return resultado;
}

function clasificar(bytes: Uint8Array, nombre: string): ArchivoParaWhatsapp | { error: string } {
  if (bytes.length < 4) return { error: MENSAJE_NO_SOPORTADO };
  const ext = extensionDe(nombre);

  const imagen = detectarImagen(bytes.slice(0, 64));
  if (imagen) {
    if (imagen.tipo === "image/jpeg" || imagen.tipo === "image/png") return { tipo: "imagen", mime: imagen.tipo };
    return { error: "WhatsApp solo acepta fotos JPG o PNG. Convierte la imagen y vuelve a intentarlo." };
  }

  // Audio: OGG (hace falta Opus), MP3, AAC suelto, AMR.
  if (ascii(bytes, 0, 4) === "OggS") {
    return contiene(bytes.slice(0, 256), "OpusHead") ? { tipo: "audio", mime: "audio/ogg" } : { error: "El audio OGG tiene que usar el códec Opus (el de las notas de voz). Mándalo como MP3 o M4A." };
  }
  if (ascii(bytes, 0, 3) === "ID3") return { tipo: "audio", mime: "audio/mpeg" };
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    const capa = (bytes[1] >> 1) & 3;
    if (capa === 0) return { tipo: "audio", mime: "audio/aac" };
    if ((bytes[1] & 0x18) !== 0x08) return { tipo: "audio", mime: "audio/mpeg" };
  }
  if (ascii(bytes, 0, 5) === "#!AMR") return { tipo: "audio", mime: "audio/amr" };

  // Contenedor MP4: M4A es audio; el resto, video.
  if (ascii(bytes, 4, 4) === "ftyp") {
    const marca = ascii(bytes, 8, 4);
    if (marca === "M4A " || marca === "M4B " || ext === "m4a" || ext === "aac") return { tipo: "audio", mime: "audio/mp4" };
    if (marca.startsWith("3gp")) return { tipo: "video", mime: "video/3gpp" };
    return { tipo: "video", mime: "video/mp4" };
  }

  // Documentos.
  if (ascii(bytes, 0, 5) === "%PDF-") return { tipo: "documento", mime: DOCUMENTOS.pdf };
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const zonas = [bytes.slice(0, 65536), bytes.slice(Math.max(0, bytes.length - 262144))];
    const tiene = (t: string) => zonas.some((z) => contiene(z, t));
    if (tiene("xl/workbook")) return { tipo: "documento", mime: DOCUMENTOS.xlsx };
    if (tiene("word/document")) return { tipo: "documento", mime: DOCUMENTOS.docx };
    if (tiene("ppt/presentation")) return { tipo: "documento", mime: DOCUMENTOS.pptx };
    return { error: MENSAJE_NO_SOPORTADO };
  }
  // Office viejo (un contenedor OLE): su extensión dice cuál es.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 && ["doc", "xls", "ppt"].includes(ext)) return { tipo: "documento", mime: DOCUMENTOS[ext] };
  // Texto plano: sin bytes nulos y con la extensión .txt.
  if (ext === "txt" && !bytes.slice(0, 8192).includes(0)) return { tipo: "documento", mime: DOCUMENTOS.txt };
  return { error: MENSAJE_NO_SOPORTADO };
}

/** Un aviso rápido, antes de subir, por lo que se ve del archivo elegido (el servidor vuelve a revisar el contenido). Null si parece bien. */
export function motivoDeRechazoEnvio(archivo: { tamano: number; nombre: string; tipo: string }): string | null {
  if (archivo.tamano <= 0) return "El archivo está vacío.";
  if (archivo.tamano > MAX_BYTES_ENVIO) return `El archivo pesa más de ${MAX_BYTES_ENVIO / MB} MB.`;
  if (archivo.tipo.startsWith("image/") && archivo.tipo !== "image/jpeg" && archivo.tipo !== "image/png") return "WhatsApp solo acepta fotos JPG o PNG.";
  if (archivo.tipo.startsWith("image/") && archivo.tamano > LIMITE_ENVIO.imagen) return `La foto pesa más de ${LIMITE_ENVIO.imagen / MB} MB.`;
  return null;
}

/** Lo que va en cada clase de mensaje de WhatsApp (`tipo` de la tabla `whatsapp_mensajes`). */
export const TIPO_DE_MENSAJE: Record<TipoEnvio, string> = { imagen: "imagen", audio: "audio", video: "video", documento: "documento", sticker: "sticker" };

/** Las clases que llevan texto al pie (el audio no). */
export const LLEVA_TEXTO: Record<TipoEnvio, boolean> = { imagen: true, audio: false, video: true, documento: true, sticker: false };
