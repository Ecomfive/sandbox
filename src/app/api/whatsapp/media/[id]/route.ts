import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { accesoCrm, MODULO_ATENCION, MODULO_COMERCIAL, pierdeLoBorrado } from "@/lib/crm/areas";
import { mensajeVisibleParaAtencion } from "@/lib/whatsapp/borrados-atencion";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { createServiceClient } from "@/lib/supabase/server";
import { corteDeBorradoEnApp, estaOculto, mensajesEliminadosEnWhatsapp } from "@/lib/whatsapp/ocultos";
import { config360, urlDescarga360, urlMedia360 } from "@/lib/whatsapp/proveedor";
import { conversacionPermitida } from "@/app/(app)/crm-dropshippers/bandeja/datos-bandeja";

export const dynamic = "force-dynamic";

/** Los tipos que se muestran en la página; cualquier otro se descarga como archivo. */
const SE_MUESTRAN = /^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp)|application\/pdf)$/;
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Una foto, audio, video o documento que mandó un dropshipper por WhatsApp (CRM › Bandeja). Meta lo guarda unos 30 días y se baja
 * con el token del servidor: aquí se pide, se revisa que la persona pueda ver esa conversación (su área) y se le pasa el archivo. El
 * id es el del mensaje en el sistema, no el de Meta.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await getUsuarioActual();
  if (!u || !(u.modulos.includes(MODULO_ATENCION) || u.modulos.includes(MODULO_COMERCIAL))) return new NextResponse("Forbidden", { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not Found", { status: 404 });
  const supabase = createServiceClient();
  const { data: m } = await supabase.from("whatsapp_mensajes").select("conversacion_id, media_id, media_mime, media_nombre").eq("id", id).maybeSingle();
  const c = m?.media_id ? await conversacionPermitida(supabase, m.conversacion_id as string, u) : null;
  if (!m?.media_id || !c) return new NextResponse("Not Found", { status: 404 });
  // Lo que se autorizó borrar (migración 0172) ya no se entrega.
  if (await estaOculto(supabase, id, m.conversacion_id as string)) return new NextResponse("Not Found", { status: 404 });
  // Lo eliminado en WhatsApp (o lo de antes de borrar el chat) tampoco se le entrega a quien tiene solo Atención.
  if (pierdeLoBorrado(accesoCrm(u))) {
    const [eliminados, corte, { data: fila }] = await Promise.all([
      mensajesEliminadosEnWhatsapp(supabase, m.conversacion_id as string),
      corteDeBorradoEnApp(supabase, m.conversacion_id as string),
      supabase.from("whatsapp_mensajes").select("momento").eq("id", id).maybeSingle(),
    ]);
    if (!mensajeVisibleParaAtencion({ id, momento: String(fila?.momento ?? "") }, eliminados, corte)) return new NextResponse("Not Found", { status: 404 });
  }
  const nombre = String(m.media_nombre || "archivo").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  // Un archivo de un chat importado del celular (bandeja › «Importar chat», migración 0169): vive en el bucket, en la carpeta del chat.
  if (String(m.media_id).startsWith("storage:")) {
    const ruta = String(m.media_id).slice(8);
    if (!ruta.startsWith(`${m.conversacion_id}/`) || ruta.includes("..")) return new NextResponse("Not Found", { status: 404 });
    const { data: archivo } = await supabase.storage.from("whatsapp-importados").download(ruta);
    if (!archivo || archivo.size > MAX_BYTES) return new NextResponse("Archivo no disponible.", { status: 410 });
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    // El tipo sale de la extensión que dio el celular: una foto solo se muestra si de verdad lo es.
    const declarado = String(m.media_mime || "").toLowerCase();
    const tipo = declarado.startsWith("image/") ? (detectarImagen(bytes.slice(0, 64))?.tipo ?? "") : declarado;
    return respuesta(bytes, tipo, nombre);
  }
  if (!/^\d+$/.test(String(m.media_id))) return new NextResponse("Not Found", { status: 404 });
  // Con 360dialog (proveedor.ts) los archivos se piden por su dominio y con su clave; si no, a Meta con el token.
  // Con varios números, el archivo se pide con la clave del número por donde llegó.
  const d360 = config360(c.numeroEmpresa);
  if (d360?.sandbox) return new NextResponse("El sandbox de 360dialog no entrega archivos: se verán con el número real.", { status: 410 });
  const token = process.env.WHATSAPP_TOKEN;
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  if (!d360 && (!token || !/^v\d+\.\d+$/.test(version))) return new NextResponse("Not Found", { status: 404 });
  const autorizacion: Record<string, string> = d360 ? { "D360-API-KEY": d360.clave } : { Authorization: `Bearer ${token}` };
  try {
    const info = await fetch(d360 ? urlMedia360(String(m.media_id)) : `https://graph.facebook.com/${version}/${m.media_id}`, { headers: autorizacion, signal: AbortSignal.timeout(10_000) });
    const j = (await info.json().catch(() => null)) as { url?: string; mime_type?: string; file_size?: number } | null;
    // Meta da una dirección temporal de su propio dominio: solo se sigue esa (con 360dialog, cambiada a su dominio).
    const descarga = j?.url ? (d360 ? urlDescarga360(j.url) : /^https:\/\/[a-z0-9.-]+\.(fbsbx|facebook|whatsapp)\.(com|net)\//i.test(j.url) ? j.url : null) : null;
    if (!info.ok || !descarga || Number(j?.file_size ?? 0) > MAX_BYTES) {
      return new NextResponse("Archivo no disponible (Meta lo guarda unos 30 días).", { status: 410 });
    }
    const archivo = await fetch(descarga, { headers: autorizacion, signal: AbortSignal.timeout(20_000) });
    if (!archivo.ok) return new NextResponse("Archivo no disponible.", { status: 410 });
    const bytes = await archivo.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return new NextResponse("Archivo muy grande.", { status: 413 });
    return respuesta(bytes, String(j?.mime_type || m.media_mime || ""), nombre);
  } catch {
    return new NextResponse("No se pudo traer el archivo de WhatsApp.", { status: 502 });
  }
}

/** El archivo para la página: los tipos que se muestran van en línea; cualquier otro, como descarga. Nunca se ejecuta nada. */
function respuesta(bytes: ArrayBuffer | Uint8Array, mime: string, nombre: string) {
  const tipo = mime.split(";")[0].trim().toLowerCase();
  const seMuestra = SE_MUESTRAN.test(tipo);
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": seMuestra ? tipo : "application/octet-stream",
      "Content-Disposition": `${seMuestra ? "inline" : "attachment"}; filename="${nombre}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
