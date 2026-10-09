// Archivos que se adjuntan a un comentario de una compra (la captura de un pago, un comprobante en PDF, una cotización en
// Excel…). Lógica pura, sin base ni React: la usa el navegador (para avisar antes de subir) y el servidor (que vuelve a revisar
// el contenido real y es el que manda).

import { detectarImagen } from "../seguridad/imagen";

/** Peso máximo de cada archivo. */
export const MAX_BYTES_ADJUNTO = 25 * 1024 * 1024;
/** Cuántos archivos puede llevar un comentario. */
export const MAX_ADJUNTOS_COMENTARIO = 10;

/**
 * Lo que se acepta, como en ClickUp (pedido de Hernán, 8 oct 2026): imágenes (no SVG: puede llevar scripts), PDF, Excel, Word,
 * PowerPoint, CSV y texto. No se aceptan HTML, programas ni comprimidos.
 */
const DOCUMENTOS: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  csv: "text/csv",
  txt: "text/plain",
};
const IMAGENES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ACEPTAR_ADJUNTOS = [...IMAGENES, ...Object.keys(DOCUMENTOS).map((e) => `.${e}`)].join(",");

export interface AdjuntoValido {
  /** `foto` para imágenes; `documento` para lo demás (las clases de `wms_compra_adjuntos`). */
  clase: "foto" | "documento";
  /** El tipo con que se guarda y se sirve (lo pone el servidor, no el navegador). */
  tipo: string;
  extension: string;
}

const extensionDe = (nombre: string) => (/\.([a-z0-9]+)$/i.exec(nombre)?.[1] ?? "").toLowerCase();

/** Por qué un archivo elegido no se puede adjuntar, o null si está bien. Es un aviso rápido: el servidor revisa el contenido. */
export function motivoDeRechazo(archivo: { tipo: string; tamano: number; nombre?: string }): string | null {
  const ext = extensionDe(archivo.nombre ?? "");
  if (!IMAGENES.includes(archivo.tipo) && !(ext in DOCUMENTOS)) return "Se pueden adjuntar imágenes, PDF, Excel, Word, PowerPoint, CSV y texto.";
  if (archivo.tamano <= 0) return "El archivo está vacío.";
  if (archivo.tamano > MAX_BYTES_ADJUNTO) return `El archivo pesa más de ${MAX_BYTES_ADJUNTO / 1024 / 1024} MB.`;
  return null;
}

const empiezaCon = (bytes: Uint8Array, firma: number[]) => firma.every((b, i) => bytes[i] === b);
/** Si los bytes contienen ese texto (para buscar las carpetas de un Office moderno, que es un ZIP). */
function contiene(bytes: Uint8Array, texto: string): boolean {
  const aguja = [...texto].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - aguja.length; i++) {
    for (let j = 0; j < aguja.length; j++) if (bytes[i + j] !== aguja[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * El tipo real de un archivo según su contenido (no según el nombre ni lo que diga el navegador), o null si no es algo
 * permitido. `bytes` es el archivo entero (los Office modernos se reconocen por sus carpetas internas) y `nombre` solo sirve
 * para distinguir un Excel de un Word viejo (los dos usan el mismo contenedor) y un CSV de un texto.
 */
export function detectarAdjunto(bytes: Uint8Array, nombre = ""): AdjuntoValido | null {
  const imagen = detectarImagen(bytes.slice(0, 64));
  if (imagen) return { clase: "foto", tipo: imagen.tipo, extension: imagen.extension };
  const doc = (extension: string): AdjuntoValido => ({ clase: "documento", tipo: DOCUMENTOS[extension], extension });
  if (String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return doc("pdf");
  const ext = extensionDe(nombre);
  // Office moderno (xlsx, docx, pptx): un ZIP con su carpeta propia.
  if (empiezaCon(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // Los nombres de las carpetas están al principio y en el índice del final del ZIP: no hace falta leerlo entero.
    const zonas = [bytes.slice(0, 65536), bytes.slice(Math.max(0, bytes.length - 262144))];
    const tiene = (t: string) => zonas.some((z) => contiene(z, t));
    if (tiene("xl/workbook")) return doc("xlsx");
    if (tiene("word/document")) return doc("docx");
    if (tiene("ppt/presentation")) return doc("pptx");
    return null; // otro ZIP: no
  }
  // Office viejo (xls, doc, ppt): el contenedor OLE de Microsoft; cuál es lo dice la extensión.
  if (empiezaCon(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return ext === "xls" || ext === "doc" || ext === "ppt" ? doc(ext) : null;
  // CSV o texto: sin bytes nulos y que no sea una página web (se sirve siempre como texto plano).
  if ((ext === "csv" || ext === "txt") && bytes.length > 0) {
    const muestra = bytes.slice(0, 8192);
    if (muestra.includes(0)) return null;
    const inicio = String.fromCharCode(...muestra.slice(0, 200)).trimStart().toLowerCase();
    if (inicio.startsWith("<")) return null;
    return { clase: "documento", tipo: "text/plain; charset=utf-8", extension: ext };
  }
  return null;
}

/** El nombre de un archivo para la ruta de almacenamiento: sin carpetas ni caracteres raros, con un largo razonable. */
export function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-100);
  return limpio || "archivo";
}

/** El ícono de un archivo por su nombre (para la lista de adjuntos de un comentario). */
export function iconoArchivo(nombre: string): string {
  const ext = extensionDe(nombre);
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return "📊";
  if (ext === "docx" || ext === "doc" || ext === "txt") return "📝";
  if (ext === "pptx" || ext === "ppt") return "📽️";
  if (ext === "pdf") return "📄";
  return "📎";
}
