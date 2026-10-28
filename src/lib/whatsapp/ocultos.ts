// Lo que se autorizó ocultar (migración 0172) y lo que está pendiente de autorización, leído con consultas aparte que ignoran el error: sin la migración la
// bandeja sigue cargando, solo sin ocultar nada ni marcar nada. Recibe el cliente de Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Los chats que ya se autorizó ocultar de la bandeja. */
export async function conversacionesOcultas(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("whatsapp_conversaciones").select("id").not("oculta_en", "is", null);
  return new Set(error ? [] : (data ?? []).map((c) => c.id as string));
}

/** Los mensajes de un chat que ya se autorizó ocultar. */
export async function mensajesOcultos(supabase: SupabaseClient, conversacionId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("whatsapp_mensajes").select("id").eq("conversacion_id", conversacionId).not("oculto_en", "is", null);
  return new Set(error ? [] : (data ?? []).map((m) => m.id as string));
}

/** Los chats y los mensajes con una petición de borrado esperando autorización. */
export async function borradosPendientes(supabase: SupabaseClient): Promise<{ chats: Set<string>; mensajes: Set<string> }> {
  const { data, error } = await supabase.from("whatsapp_solicitudes_borrado").select("tipo, conversacion_id, mensaje_id").eq("estado", "pendiente");
  const chats = new Set<string>();
  const mensajes = new Set<string>();
  if (!error) {
    for (const s of data ?? []) {
      if (s.tipo === "chat") chats.add(s.conversacion_id as string);
      else if (s.mensaje_id) mensajes.add(s.mensaje_id as string);
    }
  }
  return { chats, mensajes };
}

/** Si este mensaje (o su chat) está oculto: lo usa quien sirve archivos para no entregar lo que ya no debe verse. Sin la migración, no. */
export async function estaOculto(supabase: SupabaseClient, mensajeId: string, conversacionId: string): Promise<boolean> {
  const [m, c] = await Promise.all([
    supabase.from("whatsapp_mensajes").select("oculto_en").eq("id", mensajeId).maybeSingle(),
    supabase.from("whatsapp_conversaciones").select("oculta_en").eq("id", conversacionId).maybeSingle(),
  ]);
  return !!((!m.error && m.data?.oculto_en) || (!c.error && c.data?.oculta_en));
}
