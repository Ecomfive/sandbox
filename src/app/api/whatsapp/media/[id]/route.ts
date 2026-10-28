import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { MODULO_ATENCION, MODULO_COMERCIAL, MODULO_DIRECCION } from "@/lib/crm/areas";
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
 * área). Si el archivo ya está en el bucket del sistema (migración 0169: lo que manda el equipo y lo que llega desde entonces) se
 * redirige a un enlace firmado de pocos minutos; si no, se baja de WhatsApp (Meta lo guarda unos 30 días). El id es el del mensaje
 * en el sistema, no el de Meta.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await getUsuarioActual();
  if (!u || !(u.modulos.includes(MODULO_ATENCION) || u.modulos.includes(MODULO_COMERCIAL) || u.modulos.includes(MODULO_DIRECCION))) return new NextResponse("Forbidden", { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not Found", { status: 404 });
  const supabase = createServiceClient();
  const { data: m } = await supabase.from("whatsapp_mensajes").select("conversacion_id, media_id, media_mime, media_nombre, media_ruta").eq("id", id).maybeSingle();
  if (!m || !(m.media_id || m.media_ruta) || !(await conversacionPermitida(supabase, m.conversacion_id as string, u))) return new NextResponse("Not Found", { status: 404 });
  const nombre = String(m.media_nombre || "archivo").replace(/[^\w.\- ]+/g, "_").slice(0, 120);

  if (m.media_ruta) {
    const ruta = String(m.media_ruta);
    if ((!ruta.startsWith("salientes/") && !ruta.startsWith("entrantes/")) || ruta.includes("..")) return new NextResponse("Not Found", { status: 404 });
    const seMuestra = SE_MUESTRAN.test(String(m.media_mime ?? ""));
    const { data, error } = await supabase.storage.from(BUCKET_WHATSAPP).createSignedUrl(ruta, 600, seMuestra ? undefined : { download: nombre });
    if (error || !data?.signedUrl) return new NextResponse("Archivo no disponible.", { status: 410 });
    return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  }

  const r = await bajarArchivoWhatsapp(String(m.media_id));
  if ("error" in r) return new NextResponse(r.error, { status: r.status });
  if (r.bytes.byteLength > MAX_BYTES) return new NextResponse("Archivo muy grande.", { status: 413 });
  const tipo = String(r.mime || m.media_mime || "").split(";")[0].trim().toLowerCase();
  const seMuestra = SE_MUESTRAN.test(tipo);
  return new NextResponse(r.bytes, {
    headers: {
      "Content-Type": seMuestra ? tipo : "application/octet-stream",
      "Content-Disposition": `${seMuestra ? "inline" : "attachment"}; filename="${nombre}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
