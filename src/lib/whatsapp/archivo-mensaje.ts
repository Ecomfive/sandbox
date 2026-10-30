// El archivo (foto, audio, video, documento) de un mensaje de la bandeja, en bytes: de la copia del sistema (chat importado o archivo enviado desde aquí) o, si no,
// de WhatsApp (Meta o 360dialog), que lo guarda unos 30 días. Lo usan la ruta que lo sirve a la pantalla (`/api/whatsapp/media/[id]`) y la transcripción de audios.
// Solo servidor. No revisa permisos: quien lo llama comprueba antes que la persona pueda ver ese chat.

import type { SupabaseClient } from "@supabase/supabase-js";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { config360, urlDescarga360, urlMedia360 } from "./proveedor";

export interface MensajeConArchivo {
  conversacion_id: string;
  media_id: string | number | null;
  media_mime?: string | null;
}

/** Lo que salió bien (bytes y su tipo) o por qué no, con el código HTTP que la ruta devuelve. */
export type ArchivoDeMensaje = { bytes: Uint8Array | ArrayBuffer; mime: string } | { estado: number; mensaje: string };

export async function archivoDeMensaje(supabase: SupabaseClient, m: MensajeConArchivo, numeroEmpresa: string | null, maxBytes: number): Promise<ArchivoDeMensaje> {
  const mediaId = String(m.media_id ?? "");
  // Un archivo de un chat importado del celular (bandeja › «Importar chat», migración 0169) o mandado desde aquí: vive en el bucket, en la carpeta del chat.
  if (mediaId.startsWith("storage:")) {
    const ruta = mediaId.slice(8);
    // Las del chat interno están en `interno/` (una sola copia para las salas de todas las áreas); las demás, en la carpeta de su chat.
    if (!(ruta.startsWith(`${m.conversacion_id}/`) || ruta.startsWith("interno/")) || ruta.includes("..")) return { estado: 404, mensaje: "Not Found" };
    const { data: archivo } = await supabase.storage.from("whatsapp-importados").download(ruta);
    if (!archivo || archivo.size > maxBytes) return { estado: 410, mensaje: "Archivo no disponible." };
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    // El tipo sale de la extensión que dio el celular: una foto solo se muestra si de verdad lo es.
    const declarado = String(m.media_mime || "").toLowerCase();
    const mime = declarado.startsWith("image/") ? (detectarImagen(bytes.slice(0, 64))?.tipo ?? "") : declarado;
    return { bytes, mime };
  }
  if (!/^\d+$/.test(mediaId)) return { estado: 404, mensaje: "Not Found" };
  // Con 360dialog (proveedor.ts) los archivos se piden por su dominio y con su clave; si no, a Meta con el token.
  // Con varios números, el archivo se pide con la clave del número por donde llegó.
  const d360 = config360(numeroEmpresa);
  if (d360?.sandbox) return { estado: 410, mensaje: "El sandbox de 360dialog no entrega archivos: se verán con el número real." };
  const token = process.env.WHATSAPP_TOKEN;
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  if (!d360 && (!token || !/^v\d+\.\d+$/.test(version))) return { estado: 404, mensaje: "Not Found" };
  const autorizacion: Record<string, string> = d360 ? { "D360-API-KEY": d360.clave } : { Authorization: `Bearer ${token}` };
  try {
    const info = await fetch(d360 ? urlMedia360(mediaId) : `https://graph.facebook.com/${version}/${mediaId}`, { headers: autorizacion, signal: AbortSignal.timeout(10_000) });
    const j = (await info.json().catch(() => null)) as { url?: string; mime_type?: string; file_size?: number } | null;
    // Meta da una dirección temporal de su propio dominio: solo se sigue esa (con 360dialog, cambiada a su dominio).
    const descarga = j?.url ? (d360 ? urlDescarga360(j.url) : /^https:\/\/[a-z0-9.-]+\.(fbsbx|facebook|whatsapp)\.(com|net)\//i.test(j.url) ? j.url : null) : null;
    if (!info.ok || !descarga || Number(j?.file_size ?? 0) > maxBytes) {
      return { estado: 410, mensaje: "Archivo no disponible (Meta lo guarda unos 30 días)." };
    }
    const archivo = await fetch(descarga, { headers: autorizacion, signal: AbortSignal.timeout(20_000) });
    if (!archivo.ok) return { estado: 410, mensaje: "Archivo no disponible." };
    const bytes = await archivo.arrayBuffer();
    if (bytes.byteLength > maxBytes) return { estado: 413, mensaje: "Archivo muy grande." };
    return { bytes, mime: String(j?.mime_type || m.media_mime || "") };
  } catch {
    return { estado: 502, mensaje: "No se pudo traer el archivo de WhatsApp." };
  }
}
