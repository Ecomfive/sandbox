"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { accesoCrm, escribeEnArea, type AreaCrm } from "@/lib/crm/areas";
import { normalizarTelefono } from "@/lib/crm/telefono";
import { createServiceClient } from "@/lib/supabase/server";
import { avisarBandeja } from "@/lib/whatsapp/aviso-bandeja";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

const ES_ID = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/**
 * «Chat interno» (29 oct 2026, pedido de Alcides): el chat entre dos números de la empresa (Atención ↔ Comercial). Es una conversación del número `desde` con el
 * número `hacia` como si fuera un contacto; la bandeja la reconoce como interna y no la cuenta como cliente. Si no existe se crea. Pide poder escribir en el área del
 * número desde el que se escribe. Desde el 30 oct 2026 **no usa WhatsApp**: se escribe con `enviarMensajeInterno` (notas dentro del sistema, sin las 24 h ni las plantillas
 * de Meta). Devuelve el id de la conversación.
 */
export async function abrirChatInterno(desdeId: string, haciaId: string): Promise<{ id: string } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!ES_ID(desdeId) || !ES_ID(haciaId) || desdeId === haciaId) return { error: "Elige desde qué número y a cuál escribir." };
  const supabase = createServiceClient();
  const { data: numeros } = await supabase.from("whatsapp_numeros").select("id, nombre, numero, area").in("id", [desdeId, haciaId]).eq("activo", true);
  const desde = (numeros ?? []).find((n) => n.id === desdeId);
  const hacia = (numeros ?? []).find((n) => n.id === haciaId);
  if (!desde || !hacia) return { error: "Ese número de la empresa no está activo." };
  if (!escribeEnArea(accesoCrm(u), desde.area as AreaCrm)) return { error: `No puedes escribir desde el número de ${desde.nombre}.` };
  const tel = normalizarTelefono(hacia.numero as string);
  if (!tel) return { error: "El número de la otra área no es válido." };
  const { data: existe } = await supabase.from("whatsapp_conversaciones").select("id").eq("numero_id", desdeId).eq("telefono", tel.e164).maybeSingle();
  if (existe) return { id: existe.id as string };
  const { data: nueva, error } = await supabase
    .from("whatsapp_conversaciones")
    .insert({ numero_id: desdeId, telefono: tel.e164, area: desde.area, nombre_perfil: hacia.nombre, estado: "resuelta" })
    .select("id")
    .single();
  if (error || !nueva) return { error: "No se pudo abrir el chat interno." };
  await registrarAuditoria({ accion: "abrir_chat_interno", entidad: "whatsapp_conversaciones", entidadId: nueva.id as string, detalle: `${desde.nombre} → ${hacia.nombre}` });
  return { id: nueva.id as string };
}

/**
 * Un mensaje del chat interno (30 oct 2026, pedido de Jhokser): **se guarda como nota en el sistema y no sale por WhatsApp**, así no pesan las reglas de Meta (la
 * ventana de 24 h, las plantillas, el primer contacto, el costo y la calidad del número). `whatsapp_enviar_interno` (migración 0201) lo guarda, en una sola transacción,
 * en las dos conversaciones del chat —la de quien escribe y su espejo en el otro número— y en la del otro lado lo cuenta como no leído. Hay que poder escribir en el
 * área de este chat y que sea un chat entre dos números de la empresa. Devuelve el error como valor.
 */
export async function enviarMensajeInterno(id: string, texto: string): Promise<{ ok: true; mensajeId: string; momento: string } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const cuerpo = String(texto ?? "").trim();
  if (!cuerpo) return { error: "Escribe el mensaje." };
  if (cuerpo.length > 4096) return { error: "El mensaje es muy largo (máximo 4096 caracteres)." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
  const { data, error } = await supabase.rpc("whatsapp_enviar_interno", { p_conversacion: id, p_texto: cuerpo, p_autor_id: u.id, p_autor_nombre: u.nombre || u.email });
  if (error) {
    if (/no_es_chat_interno/.test(error.message)) return { error: "Este no es un chat interno." };
    if (/whatsapp_enviar_interno|schema cache|does not exist/i.test(error.message)) return { error: "Falta correr la migración 0201 (chat interno)." };
    return { error: "No se pudo mandar el mensaje." };
  }
  const fila = (Array.isArray(data) ? data[0] : data) as { o_mensaje?: string; o_momento?: string } | null;
  if (!fila?.o_mensaje) return { error: "No se pudo mandar el mensaje." };
  await avisarBandeja();
  return { ok: true, mensajeId: fila.o_mensaje, momento: fila.o_momento ?? new Date().toISOString() };
}
