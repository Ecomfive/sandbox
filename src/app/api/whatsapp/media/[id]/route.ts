import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { accesoCrm, MODULO_ATENCION, MODULO_COMERCIAL, pierdeLoBorrado } from "@/lib/crm/areas";
import { mensajeVisibleParaAtencion } from "@/lib/whatsapp/borrados-atencion";
import { createServiceClient } from "@/lib/supabase/server";
import { corteDeBorradoEnApp, estaOculto, mensajesEliminadosEnWhatsapp } from "@/lib/whatsapp/ocultos";
import { archivoDeMensaje } from "@/lib/whatsapp/archivo-mensaje";
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
  // De la copia del sistema (chat importado o archivo mandado desde aquí) o de WhatsApp: lo decide `archivoDeMensaje`.
  const archivo = await archivoDeMensaje(supabase, { conversacion_id: m.conversacion_id as string, media_id: m.media_id as string, media_mime: (m.media_mime as string | null) ?? null }, c.numeroEmpresa, MAX_BYTES);
  if ("estado" in archivo) return new NextResponse(archivo.mensaje, { status: archivo.estado });
  return respuesta(archivo.bytes, archivo.mime, nombre);
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
