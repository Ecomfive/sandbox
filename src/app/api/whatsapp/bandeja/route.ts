import { NextResponse } from "next/server";
import { accesoCrm, supervisaArea } from "@/lib/crm/areas";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarBandeja, cargarConversacion, conversacionPermitida, usuarioBandeja } from "@/app/(app)/crm-dropshippers/bandeja/datos-bandeja";

export const dynamic = "force-dynamic";

/** En cada refresco se traen solo los últimos mensajes del chat abierto; la bandeja los une a los que ya tiene (y a sus palomitas nuevas). */
const MENSAJES_DEL_REFRESCO = 40;

/**
 * El refresco de la bandeja de WhatsApp (29 oct 2026): la lista de chats y los últimos mensajes del chat abierto, que queda leído si es del
 * área propia (como `abrirConversacion`; un supervisor no lo marca). Es una ruta y no una acción del servidor porque las acciones de una página
 * van en fila: un refresco en curso hacía esperar al mensaje que se acababa de mandar. POST y del mismo sitio: marca leído.
 */
export async function POST(request: Request) {
  const origen = request.headers.get("origin");
  if (!origen || new URL(origen).host !== request.headers.get("host")) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const u = await usuarioBandeja(false);
  if (!u) return NextResponse.json({ error: "No tienes acceso." }, { status: 403 });
  const cuerpo = (await request.json().catch(() => ({}))) as { chat?: unknown };
  const chatId = typeof cuerpo.chat === "string" ? cuerpo.chat : null;

  const supabase = createServiceClient();
  const [bandeja, c] = await Promise.all([cargarBandeja(supabase, u), chatId ? conversacionPermitida(supabase, chatId, u) : Promise.resolve(null)]);
  if (!bandeja) return NextResponse.json({ error: "Falta correr la migración 0158 (WhatsApp)." }, { status: 503 });
  let chat = null;
  if (c) {
    const [conversacion] = await Promise.all([
      cargarConversacion(supabase, c.id, c.dropshipperId, undefined, MENSAJES_DEL_REFRESCO),
      supervisaArea(accesoCrm(u), c.area) ? null : supabase.from("whatsapp_conversaciones").update({ no_leidos: 0 }).eq("id", c.id).gt("no_leidos", 0),
    ]);
    chat = { id: c.id, mensajes: conversacion.mensajes, dropshipper: conversacion.dropshipper };
  }
  return NextResponse.json({ bandeja, chat }, { headers: { "Cache-Control": "no-store" } });
}
