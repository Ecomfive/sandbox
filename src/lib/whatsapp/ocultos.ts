// Lo que está oculto (migración 0172; desde la 0219 nada nuevo se oculta: se borra con `borrados-atencion.ts`) y lo borrado, leído con consultas aparte que ignoran el error: sin la migración la
// bandeja sigue cargando, solo sin ocultar nada ni marcar nada. Recibe el cliente de Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";
import { diaDePanama } from "./actividad";

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

/** Si este mensaje (o su chat) está oculto: lo usa quien sirve archivos para no entregar lo que ya no debe verse. Sin la migración, no. */
export async function estaOculto(supabase: SupabaseClient, mensajeId: string, conversacionId: string): Promise<boolean> {
  const [m, c] = await Promise.all([
    supabase.from("whatsapp_mensajes").select("oculto_en").eq("id", mensajeId).maybeSingle(),
    supabase.from("whatsapp_conversaciones").select("oculta_en").eq("id", conversacionId).maybeSingle(),
  ]);
  return !!((!m.error && m.data?.oculto_en) || (!c.error && c.data?.oculta_en));
}

/** Cuándo se marcó este chat como borrado en la app de WhatsApp Business (migración 0171); `null` si no, o sin la columna. */
export async function corteDeBorradoEnApp(supabase: SupabaseClient, conversacionId: string): Promise<string | null> {
  const { data, error } = await supabase.from("whatsapp_conversaciones").select("borrada_en_app_en").eq("id", conversacionId).maybeSingle();
  return error ? null : ((data?.borrada_en_app_en as string | null) ?? null);
}

/** Los mensajes de un chat que están borrados (los eliminó su autor «para todos» en WhatsApp o alguien del equipo desde el sistema, migraciones 0171 y 0219), con quién los borró desde el sistema (null: en WhatsApp). Vacío sin la columna. */
export async function mensajesBorrados(supabase: SupabaseClient, conversacionId: string): Promise<Map<string, string | null>> {
  const { data, error } = await supabase.from("whatsapp_mensajes").select("id, eliminado_por").eq("conversacion_id", conversacionId).not("eliminado_en_whatsapp_en", "is", null);
  if (!error) return new Map((data ?? []).map((m) => [m.id as string, (m.eliminado_por as string | null) ?? null]));
  // Sin la migración 0219 no existe `eliminado_por`: se leen solo los ids.
  const sola = await supabase.from("whatsapp_mensajes").select("id").eq("conversacion_id", conversacionId).not("eliminado_en_whatsapp_en", "is", null);
  return new Map(sola.error ? [] : (sola.data ?? []).map((m) => [m.id as string, null]));
}

/** Los mensajes de un chat borrados (por su autor en WhatsApp o desde el sistema): solo los ids, para esconderlos de Atención. Vacío sin la columna. */
export async function mensajesEliminadosEnWhatsapp(supabase: SupabaseClient, conversacionId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("whatsapp_mensajes").select("id").eq("conversacion_id", conversacionId).not("eliminado_en_whatsapp_en", "is", null);
  return new Set(error ? [] : (data ?? []).map((m) => m.id as string));
}

/** Lo borrado de cada chat, por día de Panamá. */
export interface BorradoPorDia {
  /** Los días con algún mensaje borrado (en WhatsApp o desde el sistema). */
  dias: Set<string>;
  /** Cuándo se marcó el chat como borrado en la app, o null. */
  corte: string | null;
  /** El día de Panamá de `corte`, o null. */
  diaCorte: string | null;
}

/**
 * Lo borrado que pesa en lo que la IA ya resumió por día (actividad del cliente), para no dárselo a quien tiene solo Atención (auditoría de seguridad, 18 nov 2026).
 * Solo vienen los chats con algo borrado; sin las columnas (migraciones 0171 y 0219), nada.
 */
export async function borradoPorDia(supabase: SupabaseClient, ids: string[]): Promise<Map<string, BorradoPorDia>> {
  const salida = new Map<string, BorradoPorDia>();
  const de = (id: string) => salida.get(id) ?? salida.set(id, { dias: new Set(), corte: null, diaCorte: null }).get(id)!;
  const unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 150) {
    const tanda = unicos.slice(i, i + 150);
    for (let d = 0; d < 50_000; d += 1000) {
      const { data, error } = await supabase
        .from("whatsapp_mensajes")
        .select("conversacion_id, momento")
        .in("conversacion_id", tanda)
        .not("eliminado_en_whatsapp_en", "is", null)
        .order("id")
        .range(d, d + 999);
      if (error) break;
      for (const m of data ?? []) de(m.conversacion_id as string).dias.add(diaDePanama(m.momento as string));
      if ((data ?? []).length < 1000) break;
    }
    const chats = await supabase.from("whatsapp_conversaciones").select("id, borrada_en_app_en").in("id", tanda).not("borrada_en_app_en", "is", null);
    if (!chats.error)
      for (const c of chats.data ?? []) {
        const b = de(c.id as string);
        b.corte = c.borrada_en_app_en as string;
        b.diaCorte = diaDePanama(b.corte);
      }
  }
  return salida;
}
