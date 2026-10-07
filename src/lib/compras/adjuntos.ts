// Archivos que se adjuntan a un comentario de una compra (la captura de un pago, un comprobante en PDF…). Lógica pura, sin base
// ni React: la usa el navegador (para avisar antes de subir) y el servidor (que vuelve a revisar el contenido real y es el que manda).

import { detectarImagen } from "../seguridad/imagen";

/** Peso máximo de cada archivo. */
export const MAX_BYTES_ADJUNTO = 10 * 1024 * 1024;
/** Cuántos archivos puede llevar un comentario. */
export const MAX_ADJUNTOS_COMENTARIO = 10;

/** Lo que se acepta: imágenes (no SVG: puede llevar scripts) y PDF. */
export const TIPOS_ADJUNTO = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"] as const;
export const ACEPTAR_ADJUNTOS = TIPOS_ADJUNTO.join(",");

export interface AdjuntoValido {
  /** `foto` para imágenes; `documento` para PDF (las clases de `wms_compra_adjuntos`). */
  clase: "foto" | "documento";
  tipo: string;
  extension: string;
}

/** Por qué un archivo elegido no se puede adjuntar, o null si está bien. Es un aviso rápido: el servidor revisa el contenido. */
export function motivoDeRechazo(archivo: { tipo: string; tamano: number }): string | null {
  if (!(TIPOS_ADJUNTO as readonly string[]).includes(archivo.tipo)) return "Solo se pueden adjuntar imágenes (JPG, PNG, WebP, GIF) y PDF.";
  if (archivo.tamano <= 0) return "El archivo está vacío.";
  if (archivo.tamano > MAX_BYTES_ADJUNTO) return `El archivo pesa más de ${MAX_BYTES_ADJUNTO / 1024 / 1024} MB.`;
  return null;
}

/** El tipo real de un archivo según su firma (los primeros bytes), o null si no es una imagen permitida ni un PDF. */
export function detectarAdjunto(bytes: Uint8Array): AdjuntoValido | null {
  const imagen = detectarImagen(bytes);
  if (imagen) return { clase: "foto", tipo: imagen.tipo, extension: imagen.extension };
  const cabecera = String.fromCharCode(...bytes.slice(0, 5));
  if (cabecera === "%PDF-") return { clase: "documento", tipo: "application/pdf", extension: "pdf" };
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
