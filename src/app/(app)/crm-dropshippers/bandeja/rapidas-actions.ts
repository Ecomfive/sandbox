"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { validarRapida, type RespuestaRapida } from "@/lib/whatsapp/rapidas";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

const ES_ID = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const TABLA = "whatsapp_respuestas_rapidas";

/** Los mensajes rápidos del equipo, los más usados primero. `falta`: todavía no se corrió la migración 0179 (la bandeja usa los de siempre). */
export async function listarRespuestasRapidas(): Promise<{ respuestas: RespuestaRapida[]; falta: boolean } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const { data, error } = await createServiceClient().from(TABLA).select("id, texto, usos").order("usos", { ascending: false }).order("creado_en", { ascending: false }).limit(200);
  if (error) return { respuestas: [], falta: true };
  return { respuestas: (data ?? []).map((r) => ({ id: r.id as string, texto: r.texto as string, usos: Number(r.usos ?? 0) })), falta: false };
}

/** Guarda un mensaje rápido (desde lo escrito en el cuadro, desde un mensaje ya mandado o desde «Mensajes rápidos»). */
export async function guardarRespuestaRapida(texto: string): Promise<{ respuesta: RespuestaRapida } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const v = validarRapida(texto);
  if ("error" in v) return v;
  const { data, error } = await createServiceClient().from(TABLA).insert({ texto: v.texto, creada_por: u.nombre || u.email }).select("id, texto, usos").single();
  if (error || !data) return { error: error?.code === "23505" ? "Ese mensaje rápido ya existe." : error?.code === "42P01" ? "Falta correr la migración 0179 (mensajes rápidos)." : "No se pudo guardar." };
  await registrarAuditoria({ accion: "crear_respuesta_rapida", entidad: TABLA, entidadId: data.id as string, detalle: v.texto.slice(0, 80) });
  revalidatePath("/crm-dropshippers/bandeja");
  return { respuesta: { id: data.id as string, texto: data.texto as string, usos: Number(data.usos ?? 0) } };
}

/** Cambia el texto de un mensaje rápido. */
export async function editarRespuestaRapida(id: string, texto: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!ES_ID(id)) return { error: "Mensaje rápido no válido." };
  const v = validarRapida(texto);
  if ("error" in v) return v;
  const { error } = await createServiceClient().from(TABLA).update({ texto: v.texto }).eq("id", id);
  if (error) return { error: error.code === "23505" ? "Ese mensaje rápido ya existe." : "No se pudo guardar." };
  await registrarAuditoria({ accion: "editar_respuesta_rapida", entidad: TABLA, entidadId: id, detalle: v.texto.slice(0, 80) });
  revalidatePath("/crm-dropshippers/bandeja");
  return { ok: true };
}

/** Quita un mensaje rápido (son plantillas de texto del equipo: no es historial de ningún chat). */
export async function borrarRespuestaRapida(id: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!ES_ID(id)) return { error: "Mensaje rápido no válido." };
  const { error } = await createServiceClient().from(TABLA).delete().eq("id", id);
  if (error) return { error: "No se pudo quitar." };
  await registrarAuditoria({ accion: "eliminar_respuesta_rapida", entidad: TABLA, entidadId: id, detalle: "Quitó un mensaje rápido" });
  revalidatePath("/crm-dropshippers/bandeja");
  return { ok: true };
}

/** Anota que se usó (para ofrecer primero los más usados). No importa si falla. */
export async function usarRespuestaRapida(id: string): Promise<void> {
  const u = await usuarioBandeja(false);
  if (!u || !ES_ID(id)) return;
  const supabase = createServiceClient();
  const { data } = await supabase.from(TABLA).select("usos").eq("id", id).maybeSingle();
  if (data) await supabase.from(TABLA).update({ usos: Number(data.usos ?? 0) + 1 }).eq("id", id);
}

/**
 * Cambia el nombre con que se ve un chat (los chats de «Contacto XXXX», o cualquiera). Manda sobre el del CRM y el del perfil de WhatsApp; vacío vuelve al de siempre.
 * No cambia nada del dropshipper en el CRM.
 */
export async function renombrarContacto(conversacionId: string, nombre: string): Promise<{ ok: true; nombre: string | null } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, conversacionId, u, true))) return { error: "Ese chat no existe o no puedes escribir en su área." };
  const limpio = String(nombre ?? "").replace(/\s+/g, " ").trim();
  if (limpio.length > 80) return { error: "El nombre es muy largo (máximo 80 caracteres)." };
  const { error } = await supabase.from("whatsapp_conversaciones").update({ nombre_personalizado: limpio || null }).eq("id", conversacionId);
  if (error) return { error: error.code === "42703" ? "Falta correr la migración 0179 (nombre del contacto)." : "No se pudo guardar el nombre." };
  await registrarAuditoria({ accion: "renombrar_contacto_whatsapp", entidad: "whatsapp_conversaciones", entidadId: conversacionId, detalle: limpio ? `Le puso el nombre «${limpio}»` : "Quitó el nombre personalizado" });
  revalidatePath("/crm-dropshippers/bandeja");
  return { ok: true, nombre: limpio || null };
}
