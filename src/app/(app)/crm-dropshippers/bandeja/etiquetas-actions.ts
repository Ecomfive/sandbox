"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { escribirEtiquetasDropshipper } from "@/lib/crm/etiquetas-dropshipper";
import { colorValido, limpiarEtiqueta, normalizarEtiquetas } from "@/lib/etiquetas";
import { createServiceClient } from "@/lib/supabase/server";
import { avisarBandeja } from "@/lib/whatsapp/aviso-bandeja";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

const FALTA_0185 = "Falta correr en Supabase la migración 0185 (etiquetas de los chats).";
const falta0185 = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42703" || e.code === "42P01" || /etiquetas/.test(e.message ?? ""));

/**
 * Las etiquetas de un chat de la Bandeja, como en ClickUp (29 oct 2026, pedido de Alcides): reemplaza la lista entera. Si el chat tiene
 * dropshipper, son las de su ficha del CRM (`dropshippers.etiquetas`); si no, las del chat. Pide poder escribir en el área
 * del chat; queda en la auditoría con lo de antes y lo de después. Devuelve la lista como quedó.
 */
export async function guardarEtiquetasChat(id: string, etiquetas: string[]): Promise<{ etiquetas: string[] } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  const chat = await conversacionPermitida(supabase, id, u, true);
  if (!chat) return { error: "Esa conversación no existe o no es de tu área." };
  const nuevas = normalizarEtiquetas(etiquetas);
  // Un chat con dropshipper usa las etiquetas de su ficha del CRM: así no hay dos juegos de etiquetas.
  if (chat.dropshipperId) {
    const r = await escribirEtiquetasDropshipper(supabase, chat.dropshipperId, nuevas);
    if (!("error" in r)) await avisarBandeja();
    return r;
  }
  const antes = await supabase.from("whatsapp_conversaciones").select("etiquetas").eq("id", id).maybeSingle();
  if (falta0185(antes.error)) return { error: FALTA_0185 };
  const previas = ((antes.data?.etiquetas as string[] | null) ?? []).slice();
  if (previas.join("\n") === nuevas.join("\n")) return { etiquetas: nuevas };
  const { error } = await supabase.from("whatsapp_conversaciones").update({ etiquetas: nuevas }).eq("id", id);
  if (error) return { error: falta0185(error) ? FALTA_0185 : "No se pudieron guardar las etiquetas." };
  await registrarAuditoria({
    accion: "etiquetas_whatsapp",
    entidad: "whatsapp_conversaciones",
    entidadId: id,
    antes: { Etiquetas: previas.join(", ") || "—" },
    despues: { Etiquetas: nuevas.join(", ") || "—" },
  });
  await avisarBandeja();
  return { etiquetas: nuevas };
}

/** Elige el color de una etiqueta de los chats (como en ClickUp): vale para todos los chats que la tengan. */
export async function guardarColorEtiquetaChat(nombre: string, color: string): Promise<{ ok: true } | { error: string }> {
  if (!(await usuarioBandeja(true))) return { error: "No tienes permiso para escribir en el CRM." };
  const limpio = limpiarEtiqueta(nombre);
  if (!limpio) return { error: "Etiqueta no válida." };
  if (!colorValido(color)) return { error: "Color no válido." };
  const { error } = await createServiceClient()
    .from("whatsapp_etiquetas")
    .upsert({ nombre: limpio, color, actualizado_en: new Date().toISOString() }, { onConflict: "nombre" });
  if (error) return { error: falta0185(error) ? FALTA_0185 : "No se pudo guardar el color." };
  return { ok: true };
}
