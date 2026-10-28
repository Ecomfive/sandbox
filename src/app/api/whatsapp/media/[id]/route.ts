import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { MODULO_ATENCION, MODULO_COMERCIAL, MODULO_DIRECCION } from "@/lib/crm/areas";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { createServiceClient } from "@/lib/supabase/server";
import { BUCKET_WHATSAPP } from "@/lib/whatsapp/archivos";
import { bajarArchivoWhatsapp } from "@/lib/whatsapp/media";
import { conversacionPermitida } from "@/app/(app)/crm-dropshippers/bandeja/datos-bandeja";

export const dynamic = "force-dynamic";

/** Los tipos que se muestran en la página; cualquier otro se descarga como archivo. */
const SE_MUESTRAN = /^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp)|application\/pdf)$/;
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Una foto, audio, video o documento de un chat de WhatsApp (CRM › Bandeja). Se revisa que la persona pueda ver esa conversación (su
 * área). Tres orígenes:
 *  - un chat importado del celular (migración 0169, `media_id` «storage:…»): del bucket `whatsapp-importados`;
 *  - lo que manda el equipo y lo que llega desde la migración 0170 (`media_ruta`): enlace firmado de pocos minutos del bucket `whatsapp`;
 *  - lo demás se baja de WhatsApp (Meta lo guarda unos 30 días).
 * El id es el del mensaje en el sistema, no el de Meta.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await getUsuarioActual();
  if (!u || !(u.modulos.includes(MODULO_ATENCION) || u.modulos.includes(MODULO_COMERCIAL) || u.modulos.includes(MODULO_DIRECCION))) return new NextResponse("Forbidden", { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not Found", { status: 404 });
  const supabase = createServiceClient();
  // `media_ruta` es de la migración 0170: sin ella se lee igual el resto.
  const conRuta = await supabase.from("whatsapp_mensajes").select("conversacion_id, media_id, media_mime, media_nombre, media_ruta").eq("id", id).maybeSingle();
  const { data: m } = conRuta.error ? await supabase.from("whatsapp_mensajes").select("conversacion_id, media_id, media_mime, media_nombre").eq("id", id).maybeSingle() : conRuta;
  const ruta = (m as { media_ruta?: string | null } | null)?.media_ruta ?? null;
  if (!m || !(m.media_id || ruta) || !(await conversacionPermitida(supabase, m.conversacion_id as string, u))) return new NextResponse("Not Found", { status: 404 });
  const nombre = String(m.media_nombre || "archivo").replace(/[^\w.\- ]+/g, "_").slice(0, 120);

  // Un archivo de un chat importado del celular (bandeja › «Importar chat», migración 0169): vive en el bucket, en la carpeta del chat.
  if (String(m.media_id ?? "").startsWith("storage:")) {
    const rutaImportada = String(m.media_id).slice(8);
    if (!rutaImportada.startsWith(`${m.conversacion_id}/`) || rutaImportada.includes("..")) return new NextResponse("Not Found", { status: 404 });
    const { data: archivo } = await supabase.storage.from("whatsapp-importados").download(rutaImportada);
    if (!archivo || archivo.size > MAX_BYTES) return new NextResponse("Archivo no disponible.", { status: 410 });
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    // El tipo sale de la extensión que dio el celular: una foto solo se muestra si de verdad lo es.
    const declarado = String(m.media_mime || "").toLowerCase();
    const tipo = declarado.startsWith("image/") ? (detectarImagen(bytes.slice(0, 64))?.tipo ?? "") : declarado;
    return respuesta(bytes, tipo, nombre);
  }

  // Lo que manda el equipo y lo que llega desde la migración 0170: enlace firmado del bucket (no pasa por aquí: los videos pesan).
  if (ruta) {
    if ((!ruta.startsWith("salientes/") && !ruta.startsWith("entrantes/")) || ruta.includes("..")) return new NextResponse("Not Found", { status: 404 });
    const seMuestra = SE_MUESTRAN.test(String(m.media_mime ?? ""));
    const { data, error } = await supabase.storage.from(BUCKET_WHATSAPP).createSignedUrl(ruta, 600, seMuestra ? undefined : { download: nombre });
    if (error || !data?.signedUrl) return new NextResponse("Archivo no disponible.", { status: 410 });
    return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  }

  const r = await bajarArchivoWhatsapp(String(m.media_id));
  if ("error" in r) return new NextResponse(r.error, { status: r.status });
  if (r.bytes.byteLength > MAX_BYTES) return new NextResponse("Archivo muy grande.", { status: 413 });
  return respuesta(r.bytes, String(r.mime || m.media_mime || ""), nombre);
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
