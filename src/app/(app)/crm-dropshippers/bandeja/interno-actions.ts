"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { accesoCrm, escribeEnArea, type AreaCrm } from "@/lib/crm/areas";
import { normalizarTelefono } from "@/lib/crm/telefono";
import { createServiceClient } from "@/lib/supabase/server";
import { usuarioBandeja } from "./datos-bandeja";

const ES_ID = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/**
 * «WhatsApp interno» (29 oct 2026, pedido de Alcides): el chat entre dos números de la empresa (Atención ↔ Comercial), por WhatsApp. Es una
 * conversación del número `desde` con el número `hacia` como si fuera un contacto; la bandeja la reconoce como interna y no la cuenta como cliente.
 * Si no existe se crea. Pide poder escribir en el área del número desde el que se escribe. Pasadas 24 horas sin respuesta, se escribe con una
 * plantilla, como con cualquier contacto. Devuelve el id de la conversación.
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
