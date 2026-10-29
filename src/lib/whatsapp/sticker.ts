// Stickers de WhatsApp (29 oct 2026): tienen que ser WebP de 512 × 512, de hasta 100 KB si son quietos y 500 KB si se mueven. Aquí se convierte cualquier imagen (PNG, JPG, WebP, GIF)
// a eso, con fondo transparente alrededor y bajando la calidad hasta que quepa.

import sharp from "sharp";

export const LADO_STICKER = 512;
export const MAX_STICKER_QUIETO = 100 * 1024;
export const MAX_STICKER_ANIMADO = 500 * 1024;

export async function aSticker(bytes: Uint8Array): Promise<{ bytes: Uint8Array; animado: boolean } | { error: string }> {
  let animado = false;
  try {
    const meta = await sharp(bytes, { animated: true, limitInputPixels: 50_000_000 }).metadata();
    animado = (meta.pages ?? 1) > 1;
  } catch {
    return { error: "No se pudo leer la imagen. Usa un PNG, JPG, WebP o GIF." };
  }
  const tope = animado ? MAX_STICKER_ANIMADO : MAX_STICKER_QUIETO;
  for (const calidad of [90, 75, 60, 45, 30, 20]) {
    try {
      const salida = await sharp(bytes, { animated: animado, limitInputPixels: 50_000_000 })
        .resize(LADO_STICKER, LADO_STICKER, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: calidad, effort: 4 })
        .toBuffer();
      if (salida.length <= tope) return { bytes: new Uint8Array(salida), animado };
    } catch {
      return { error: "No se pudo convertir la imagen a sticker." };
    }
  }
  return { error: `La imagen pesa demasiado para ser un sticker (máximo ${tope / 1024} KB). Prueba con una más simple o más corta.` };
}
