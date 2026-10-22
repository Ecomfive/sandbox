// Solo en el navegador: reduce una imagen modelo antes de mandarla a analizar (la IA no necesita más de ~1000 px y una acción del servidor
// no admite más de 1 MB en total). La imagen nunca se guarda: se manda, se analiza y se descarta.

/** Lado más largo y calidad que se prueban, de mayor a menor, hasta que la imagen quepa en `maxBytes`. */
const INTENTOS: [lado: number, calidad: number][] = [
  [1024, 0.82],
  [1024, 0.65],
  [800, 0.65],
  [640, 0.6],
  [512, 0.55],
];

const aDataUrl = (blob: Blob) =>
  new Promise<string>((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(new Error("No se pudo leer la imagen."));
    lector.readAsDataURL(blob);
  });

/** La imagen como `data:image/jpeg;base64,…` de a lo más `maxBytes`. Lanza con el motivo en palabras si no se puede. */
export async function comprimirImagen(archivo: File, maxBytes = 170_000): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/i.test(archivo.type)) throw new Error("Solo se aceptan imágenes JPG, PNG o WebP.");
  const imagen = await createImageBitmap(archivo).catch(() => null);
  if (!imagen) throw new Error("No se pudo leer la imagen.");
  try {
    for (const [lado, calidad] of INTENTOS) {
      const escala = Math.min(1, lado / Math.max(imagen.width, imagen.height));
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.max(1, Math.round(imagen.width * escala));
      lienzo.height = Math.max(1, Math.round(imagen.height * escala));
      const ctx = lienzo.getContext("2d");
      if (!ctx) throw new Error("No se pudo preparar la imagen.");
      // Un PNG con fondo transparente se vería negro en JPEG.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
      const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/jpeg", calidad));
      if (blob && blob.size <= maxBytes) return aDataUrl(blob);
    }
  } finally {
    imagen.close();
  }
  throw new Error("La imagen es muy pesada incluso reducida. Prueba con otra.");
}
