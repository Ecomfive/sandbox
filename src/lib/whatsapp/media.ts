import { config360, urlDescarga360, urlMedia360 } from "./proveedor";

const MAX_BYTES = 100 * 1024 * 1024;

/**
 * Baja de WhatsApp un archivo que mandó un dropshipper (por su id de Meta): con 360dialog por su dominio y su clave, si no con el
 * token de Meta. Solo se sigue la dirección temporal que da Meta (de su dominio). El sandbox de 360dialog no entrega archivos.
 * Meta los guarda unos 30 días: por eso se copian al bucket al llegar (guardar.ts).
 */
export async function bajarArchivoWhatsapp(mediaId: string): Promise<{ bytes: ArrayBuffer; mime: string | null } | { error: string; status: number }> {
  if (!/^\d+$/.test(mediaId)) return { error: "Archivo no válido.", status: 404 };
  const d360 = config360();
  if (d360?.sandbox) return { error: "El sandbox de 360dialog no entrega archivos: se verán con el número real.", status: 410 };
  const token = process.env.WHATSAPP_TOKEN;
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  if (!d360 && (!token || !/^v\d+\.\d+$/.test(version))) return { error: "WhatsApp no está conectado.", status: 404 };
  const autorizacion: Record<string, string> = d360 ? { "D360-API-KEY": d360.clave } : { Authorization: `Bearer ${token}` };
  try {
    const info = await fetch(d360 ? urlMedia360(mediaId) : `https://graph.facebook.com/${version}/${mediaId}`, { headers: autorizacion, signal: AbortSignal.timeout(10_000) });
    const j = (await info.json().catch(() => null)) as { url?: string; mime_type?: string; file_size?: number } | null;
    const descarga = j?.url ? (d360 ? urlDescarga360(j.url) : /^https:\/\/[a-z0-9.-]+\.(fbsbx|facebook|whatsapp)\.(com|net)\//i.test(j.url) ? j.url : null) : null;
    if (!info.ok || !descarga || Number(j?.file_size ?? 0) > MAX_BYTES) return { error: "Archivo no disponible (Meta lo guarda unos 30 días).", status: 410 };
    const archivo = await fetch(descarga, { headers: autorizacion, signal: AbortSignal.timeout(25_000) });
    if (!archivo.ok) return { error: "Archivo no disponible.", status: 410 };
    const bytes = await archivo.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return { error: "Archivo muy grande.", status: 413 };
    return { bytes, mime: j?.mime_type ?? null };
  } catch {
    return { error: "No se pudo traer el archivo de WhatsApp.", status: 502 };
  }
}
