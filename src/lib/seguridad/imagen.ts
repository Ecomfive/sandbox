/**
 * Validación de imágenes subidas: no basta con el tipo que declara el navegador (`archivo.type`) ni con la extensión del
 * nombre, que quien sube el archivo controla. Se mira la firma de los primeros bytes y de ahí salen el tipo y la
 * extensión que se guardan. No se admite SVG: puede llevar scripts.
 */

export interface ImagenValida {
  tipo: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  extension: "jpg" | "png" | "webp" | "gif";
}

const ascii = (bytes: Uint8Array, desde: number, largo: number) => String.fromCharCode(...bytes.slice(desde, desde + largo));

/** El tipo real de la imagen según su firma, o null si no es JPEG, PNG, WebP ni GIF. */
export function detectarImagen(bytes: Uint8Array): ImagenValida | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { tipo: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { tipo: "image/png", extension: "png" };
  }
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) return { tipo: "image/gif", extension: "gif" };
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return { tipo: "image/webp", extension: "webp" };
  return null;
}
