import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ESTADO_DE_EVENTO, estadoSiguiente, firmaChatmaidValida, interpretarRespuesta, type EstadoMensaje } from "@/lib/ventas/chatmaid";
import { normalizarTelefono, type PaisOp } from "@/lib/ventas/operacion";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const MAX_CUERPO = 200_000;

/**
 * Webhook de Chatmaid: estados de los avisos (enviado, entregado, leído, fallido) y respuestas de los clientes.
 * No hay sesión: la única puerta es la firma `X-Chatmaid-Signature` con `CHATMAID_WEBHOOK_SECRET`. Sin secreto, todo se rechaza.
 * Una respuesta «1»/«2» a la orden por confirmar queda como contacto (confirmó / canceló); la fase no se mueve sola.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_CUERPO) return new NextResponse("Payload Too Large", { status: 413 });
  const cuerpo = await request.text();
  if (cuerpo.length > MAX_CUERPO) return new NextResponse("Payload Too Large", { status: 413 });
  if (!firmaChatmaidValida(cuerpo, request.headers.get("x-chatmaid-signature"), process.env.CHATMAID_WEBHOOK_SECRET)) return new NextResponse("Forbidden", { status: 403 });
  let j: { event?: string; type?: string; data?: Record<string, unknown> } | null = null;
  try { j = JSON.parse(cuerpo); } catch { return new NextResponse("Bad Request", { status: 400 }); }
  const evento = request.headers.get("x-chatmaid-event") ?? j?.event ?? j?.type ?? "";
  const d = (j?.data ?? {}) as Record<string, unknown>;
  const mid = typeof d.messageId === "string" ? d.messageId : typeof d.id === "string" ? d.id : null;
  const supabase = createServiceClient();
  let claveEvento: string | null = null;
  try {
    const clave = `${evento}:${mid ?? cuerpo.length}:${String(d.timestamp ?? d.createdAt ?? d.updatedAt ?? "")}`.slice(0, 200);
    const { error: dup } = await supabase.from("ven_whatsapp_eventos").insert({ clave });
    if (dup) return NextResponse.json({ ok: true, repetido: true });
    claveEvento = clave;

    if (ESTADO_DE_EVENTO[evento] && mid) {
      const { data: m } = await supabase.from("ven_whatsapp_mensajes").select("id, estado").eq("proveedor_id", mid).maybeSingle();
      if (m) {
        const nuevo = estadoSiguiente(m.estado as EstadoMensaje, ESTADO_DE_EVENTO[evento]);
        await supabase.from("ven_whatsapp_mensajes").update({ estado: nuevo, error: evento === "message.failed" ? String(d.errorMessage ?? d.errorCode ?? "Falló el envío").slice(0, 300) : null, actualizado_en: new Date().toISOString() }).eq("id", m.id);
      }
    } else if (evento === "message.received") {
      const de = typeof d.from === "string" ? d.from : "";
      const texto = typeof d.content === "string" ? d.content : typeof d.text === "string" ? d.text : "";
      const digitos = de.replace(/\D/g, "");
      const pais: PaisOp | null = digitos.startsWith("507") ? "PA" : digitos.startsWith("506") ? "CR" : digitos.startsWith("52") ? "MX" : null;
      if (pais) {
        const clave = normalizarTelefono(pais, digitos).clave;
        const { data: cli } = await supabase.from("ven_ordenes_clientes").select("orden_id, ven_ordenes(fase, creado_en)").eq("telefono_clave", clave).limit(20);
        const abiertas = ((cli ?? []) as unknown as { orden_id: string; ven_ordenes: { fase: string | null; creado_en: string } | null }[])
          .filter((c) => c.ven_ordenes?.fase === "por_confirmar")
          .sort((a, b) => (b.ven_ordenes!.creado_en > a.ven_ordenes!.creado_en ? 1 : -1));
        const orden = abiertas[0]?.orden_id ?? null;
        await supabase.from("ven_whatsapp_mensajes").insert({ orden_id: orden, telefono_clave: clave, direccion: "entrante", cuerpo: texto.slice(0, 1000), estado: "recibido", proveedor_id: mid });
        const r = interpretarRespuesta(texto);
        if (orden && r) {
          await supabase.from("ven_orden_contactos").insert({ orden_id: orden, canal: "whatsapp", resultado: r === "confirma" ? "confirmo" : "cancela", nota: "Respuesta del cliente por WhatsApp", por: "Cliente" });
          await supabase.from("ven_orden_eventos").insert({ orden_id: orden, tipo: "nota", detalle: `El cliente respondió por WhatsApp: ${r === "confirma" ? "confirma" : "quiere cancelar"}`, usuario: "Cliente" });
        }
      }
    }
  } catch {
    // Chatmaid reintenta solo si no recibe 2xx: se libera la clave para que el reintento sí se procese.
    if (claveEvento) await supabase.from("ven_whatsapp_eventos").delete().eq("clave", claveEvento);
    return new NextResponse("Error", { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
