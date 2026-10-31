// Enlazar un chat de WhatsApp con un dropshipper del CRM (29 oct 2026). Un chat se enlaza solo si el número que escribe es el principal de un dropshipper
// (`contacto_telefono`) o uno de sus otros números (`dropshipper_telefonos`, migración 0177), o a mano desde el chat. Aquí vive lo que comparten los mensajes que
// llegan, la importación de chats, la ficha del CRM y las acciones del chat. Los números nunca salen del servidor.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Un número completo con prefijo de país (E.164): el único que se puede guardar y emparejar. Los chats sin teléfono (un id de usuario) no. */
export const esTelefonoCompleto = (t: string): boolean => /^\+\d{8,15}$/.test(t);

export type DecisionTelefono = "no_aplica" | "ya_es" | "ocupado" | "principal" | "alterno";

/**
 * Qué hacer con el número de un chat que se acaba de vincular a un dropshipper: nada si no es un número completo, nada si ya es suyo, nada si es de otro dropshipper
 * (no se le quita a nadie), y si no, el principal cuando no tiene ninguno o uno más de sus números.
 */
export function decidirGuardadoTelefono(a: { telefono: string; principal: string | null; alternos: readonly string[]; deOtro: boolean }): DecisionTelefono {
  if (!esTelefonoCompleto(a.telefono)) return "no_aplica";
  if (a.principal === a.telefono || a.alternos.includes(a.telefono)) return "ya_es";
  if (a.deOtro) return "ocupado";
  return a.principal ? "alterno" : "principal";
}

/** El dropshipper de cada número (principal u otro número suyo). Sin la migración 0177 solo cuentan los principales. */
export async function dropshipperPorTelefonos(supabase: SupabaseClient, telefonos: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!telefonos.length) return mapa;
  const [principales, otros] = await Promise.all([
    supabase.from("dropshippers").select("id, contacto_telefono").in("contacto_telefono", telefonos),
    supabase.from("dropshipper_telefonos").select("dropshipper_id, telefono").in("telefono", telefonos),
  ]);
  if (!otros.error) for (const o of otros.data ?? []) mapa.set(o.telefono as string, o.dropshipper_id as string);
  for (const d of principales.data ?? []) mapa.set(d.contacto_telefono as string, d.id as string);
  return mapa;
}

/** Si el número ya es de otro dropshipper (como principal o como otro número). */
export async function telefonoDeOtro(supabase: SupabaseClient, telefono: string, exceptoDropshipperId: string | null): Promise<boolean> {
  const [principal, otro] = await Promise.all([
    supabase.from("dropshippers").select("id").eq("contacto_telefono", telefono).limit(1),
    supabase.from("dropshipper_telefonos").select("dropshipper_id").eq("telefono", telefono).limit(1),
  ]);
  const ajeno = (id: unknown) => !!id && id !== exceptoDropshipperId;
  return ajeno(principal.data?.[0]?.id) || (!otro.error && ajeno(otro.data?.[0]?.dropshipper_id));
}

/** Enlaza con el dropshipper todos los chats sin enlazar de ese número (puede haber uno por cada número de la empresa). Devuelve cuántos. */
export async function enlazarChatsPorTelefono(supabase: SupabaseClient, dropshipperId: string, telefono: string): Promise<number> {
  if (!esTelefonoCompleto(telefono)) return 0;
  const { data, error } = await supabase.from("whatsapp_conversaciones").update({ dropshipper_id: dropshipperId }).eq("telefono", telefono).is("dropshipper_id", null).select("id");
  return error ? 0 : (data?.length ?? 0);
}

/** Guarda el número de un chat en la ficha del dropshipper con el que se vinculó (ver `decidirGuardadoTelefono`). */
export async function guardarTelefonoDelChat(supabase: SupabaseClient, dropshipperId: string, telefono: string, autor: string | null): Promise<DecisionTelefono> {
  if (!esTelefonoCompleto(telefono)) return "no_aplica";
  const [ficha, otros, deOtro] = await Promise.all([
    supabase.from("dropshippers").select("contacto_telefono").eq("id", dropshipperId).maybeSingle(),
    supabase.from("dropshipper_telefonos").select("telefono").eq("dropshipper_id", dropshipperId),
    telefonoDeOtro(supabase, telefono, dropshipperId),
  ]);
  const decision = decidirGuardadoTelefono({
    telefono,
    principal: (ficha.data?.contacto_telefono as string | null) ?? null,
    alternos: otros.error ? [] : (otros.data ?? []).map((o) => o.telefono as string),
    deOtro,
  });
  if (decision === "principal") {
    const { error } = await supabase.from("dropshippers").update({ contacto_telefono: telefono }).eq("id", dropshipperId).is("contacto_telefono", null);
    return error ? "ocupado" : "principal";
  }
  if (decision === "alterno") {
    const { error } = await supabase.from("dropshipper_telefonos").insert({ dropshipper_id: dropshipperId, telefono, creado_por: autor });
    return error ? "ocupado" : "alterno";
  }
  return decision;
}

/** Quita el número de un chat de la ficha de ese dropshipper (si estaba como principal o como otro). Se usa al deshacer un vínculo equivocado. */
export async function quitarTelefonoDelChat(supabase: SupabaseClient, dropshipperId: string, telefono: string): Promise<void> {
  if (!esTelefonoCompleto(telefono)) return;
  await Promise.all([
    supabase.from("dropshippers").update({ contacto_telefono: null }).eq("id", dropshipperId).eq("contacto_telefono", telefono),
    supabase.from("dropshipper_telefonos").delete().eq("dropshipper_id", dropshipperId).eq("telefono", telefono),
  ]);
}
