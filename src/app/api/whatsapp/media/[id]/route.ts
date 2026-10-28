import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { MODULO_ATENCION, MODULO_COMERCIAL } from "@/lib/crm/areas";
import { createServiceClient } from "@/lib/supabase/server";
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
  if (!m?.media_id || !(await conversacionPermitida(supabase, m.conversacion_id as string, u))) return new NextResponse("Not Found", { status: 404 });
  if (!/^\d+$/.test(String(m.media_id))) return new NextResponse("Not Found", { status: 404 });
  // Con 360dialog (proveedor.ts) los archivos se piden por su dominio y con su clave; si no, a Meta con el token.
  const d360 = config360();
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
    const tipo = String(j?.mime_type || m.media_mime || "").split(";")[0].trim().toLowerCase();
    const seMuestra = SE_MUESTRAN.test(tipo);
    const nombre = String(m.media_nombre || "archivo").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": seMuestra ? tipo : "application/octet-stream",
        "Content-Disposition": `${seMuestra ? "inline" : "attachment"}; filename="${nombre}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new NextResponse("No se pudo traer el archivo de WhatsApp.", { status: 502 });
  }
}
