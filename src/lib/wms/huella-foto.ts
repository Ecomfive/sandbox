import sharp from "sharp";

/**
 * La huella de una foto (dHash de 64 bits, 16 cifras hexadecimales): la imagen se reduce a 9 × 8 en gris y cada bit dice si un
 * punto es más claro que el de su derecha. Dos fotos del mismo producto (otro tamaño, otra compresión, un recorte leve) dan
 * huellas a pocos bits de distancia (`distanciaHuella`). Devuelve null si no se puede leer la imagen.
 */
export async function huellaFoto(bytes: Uint8Array): Promise<string | null> {
  try {
    const { data } = await sharp(bytes).rotate().flatten({ background: "#ffffff" }).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    let hex = "";
    for (let fila = 0; fila < 8; fila++) {
      let nibble = 0;
      for (let col = 0; col < 8; col++) {
        nibble = (nibble << 1) | (data[fila * 9 + col] > data[fila * 9 + col + 1] ? 1 : 0);
        if (col === 3 || col === 7) {
          hex += nibble.toString(16);
          nibble = 0;
        }
      }
    }
    return hex;
  } catch {
    return null;
  }
}
