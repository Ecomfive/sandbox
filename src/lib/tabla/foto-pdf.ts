// Una foto lista para un PDF (navegador): se trae, se achica y se vuelve JPEG. La usan las descargas en PDF de las tablas y de las llegadas de Compras.

/** Lado mayor de la foto en el PDF, en píxeles: el doble de lo que ocupa, para que se vea nítida al imprimir. */
export const LADO_FOTO_PDF = 160;

/**
 * Trae una foto para el PDF y la achica a un JPEG (pdf-lib solo pone JPEG o PNG, y así el PDF pesa poco aunque la foto sea WEBP o grande). Si la red de
 * fotos de Dropi no deja leerla desde el navegador, la pide a través del sistema (`/api/publicaciones-dropi/foto`). null si no se pudo.
 */
export async function fotoParaPdf(url: string, lado = LADO_FOTO_PDF): Promise<Uint8Array | null> {
  const traer = async (u: string) => {
    const r = await fetch(u, { credentials: u.startsWith("/") ? "same-origin" : "omit" });
    return r.ok ? r.blob() : null;
  };
  let blob: Blob | null = null;
  try {
    blob = await traer(url);
  } catch {
    blob = null;
  }
  if (!blob && /^https:\/\/[^/]*cloudfront\.net\//.test(url)) {
    try {
      blob = await traer(`/api/publicaciones-dropi/foto?u=${encodeURIComponent(url)}`);
    } catch {
      blob = null;
    }
  }
  if (!blob) return null;
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(bmp.width * k));
    lienzo.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    // Fondo blanco: una PNG transparente no queda negra en JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    bmp.close();
    const jpeg = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
    return jpeg ? new Uint8Array(await jpeg.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
