import type { SupabaseClient } from "@supabase/supabase-js";
import { chatVisibleParaAtencion } from "@/lib/whatsapp/borrados-atencion";
import { conversacionesOcultas } from "@/lib/whatsapp/ocultos";
import type { AreaCrm } from "@/lib/crm/areas";
import { esTelefonoInterno } from "@/lib/crm/chat-interno";

/**
 * Las conversaciones de WhatsApp sin responder en los números que ve la persona (también las de quien no está en el CRM): Atención cuenta las de su área,
 * Comercial las suyas y las de Atención, Dirección las tres (`areas`). Un chat que se autorizó borrar (migración 0172) no cuenta, ni —para quien tiene solo
 * Atención— uno borrado en la app de WhatsApp Business (`sinBorrados`). Lo usan el globo de la pestaña «Bandeja de WhatsApp» y la burbuja de la lista.
 */
export async function contarSinResponder(supabase: SupabaseClient, areas: AreaCrm[], sinBorrados = false): Promise<number> {
  const { data, error } = await supabase
    .from("whatsapp_conversaciones")
    .select("id, telefono, ultimo_mensaje_en")
    .eq("estado", "abierta")
    .or("no_leidos.gt.0,ultimo_de.eq.entrante")
    .in("area", areas)
    .limit(2000);
  if (error) return 0;
  const ocultas = await conversacionesOcultas(supabase);
  // El chat interno entre las áreas (el teléfono es otro número de la empresa) no es un cliente que espera respuesta.
  const digitos = (t: unknown) => String(t ?? "").replace(/\D/g, "");
  const { data: numeros } = await supabase.from("whatsapp_numeros").select("numero");
  const deLaEmpresa = new Set((numeros ?? []).map((n) => digitos(n.numero)).filter((d) => d.length >= 7));
  let chats = (data ?? []).filter((c) => !ocultas.has(c.id as string) && !esTelefonoInterno(c.telefono as string) && !deLaEmpresa.has(digitos(c.telefono)));
  if (sinBorrados && chats.length) {
    // Sin la columna (migración 0171) la consulta falla y no se descuenta nada.
    const marcadas = await supabase.from("whatsapp_conversaciones").select("id, borrada_en_app_en").not("borrada_en_app_en", "is", null);
    if (!marcadas.error) {
      const corte = new Map((marcadas.data ?? []).map((x) => [x.id as string, x.borrada_en_app_en as string]));
      chats = chats.filter((c) => chatVisibleParaAtencion((c.ultimo_mensaje_en as string | null) ?? null, corte.get(c.id as string) ?? null));
    }
  }
  return chats.length;
}
