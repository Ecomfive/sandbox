// Achicar una foto en el navegador antes de subirla (25 nov 2026, panel del repartidor: una foto del celular pesa 2 a 5 MB y las acciones del sistema
// reciben hasta 1 MB, así que el envío fallaba y la pantalla se quedaba «Guardando…»). La deja en JPEG de hasta 1600 px por lado, que se lee bien y pesa
// unos cientos de KB. Si el navegador no puede leerla, devuelve la original. Solo navegador.

/** El tope de lo que se manda en una acción (1 MB menos un margen para el resto de los datos). */
export const TOPE_SUBIDA = 950 * 1024;

export async function comprimirFoto(archivo: File, lado = 1600, calidad = 0.8): Promise<File> {
  if (!archivo.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(archivo.name)) return archivo;
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo leer la foto."));
      i.src = url;
    });
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
    lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = lienzo.getContext("2d");
    if (!ctx) return archivo;
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    let blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/jpeg", calidad));
    // Si todavía pesa mucho (fotos con mucho detalle), una vuelta más con menos calidad.
    if (blob && blob.size > TOPE_SUBIDA) blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/jpeg", 0.6));
    if (!blob) return archivo;
    return new File([blob], `${archivo.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, { type: "image/jpeg" });
  } catch {
    return archivo;
  } finally {
    URL.revokeObjectURL(url);
  }
}
