"use server";

import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { accesoCrm, MODULO_ATENCION, MODULO_COMERCIAL } from "@/lib/crm/areas";
import { createServiceClient } from "@/lib/supabase/server";
import { enviarTextoWhatsapp } from "@/lib/whatsapp/api";
import { resumenMensaje } from "@/lib/whatsapp/extraer";
import { minutosVentana } from "@/lib/whatsapp/ventana";
import { areasDe, cargarBandeja, cargarConversacion, conversacionPermitida, type ConversacionVista, type MensajeVista, type NumeroVista, type ResumenDropshipper } from "./datos-bandeja";

/** WhatsApp acepta hasta 4096 caracteres por mensaje de texto. */
const MAX_TEXTO = 4096;

/** Quien abre el CRM (Atención o Comercial); con `escribe`, además puede escribir en alguna de las dos áreas. */
async function usuarioBandeja(escribe: boolean): Promise<UsuarioActual | null> {
  const u = await getUsuarioActual();
  if (!u || !(u.modulos.includes(MODULO_ATENCION) || u.modulos.includes(MODULO_COMERCIAL))) return null;
  if (escribe) {
    const a = accesoCrm(u);
    if (!a.escribeAtencion && !a.escribeComercial) return null;
  }
  return u;
}

/** La lista de conversaciones, para refrescar la bandeja cada pocos segundos. */
export async function obtenerBandeja(): Promise<{ numeros: NumeroVista[]; conversaciones: ConversacionVista[] } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  return (await cargarBandeja(createServiceClient(), u)) ?? { error: "Falta correr la migración 0158 (WhatsApp)." };
}

/**
 * Los últimos mensajes del dropshipper por WhatsApp, para su ficha del CRM: su conversación más reciente en los números que ve la
 * persona. Solo mira: no la marca leída (eso pasa al abrirla en la bandeja). `null` si nunca escribió.
 */
export async function ultimosMensajesDropshipper(
  dropshipperId: string,
): Promise<{ conversacionId: string; numero: string; mensajes: MensajeVista[]; ultimoEntranteEn: string | null; noLeidos: number } | null | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  if (!/^[0-9a-f-]{36}$/i.test(dropshipperId)) return null;
  const supabase = createServiceClient();
  const { data: c, error } = await supabase
    .from("whatsapp_conversaciones")
    .select("id, no_leidos, ultimo_entrante_en, whatsapp_numeros!inner(nombre, area)")
    .eq("dropshipper_id", dropshipperId)
    .in("whatsapp_numeros.area", areasDe(u))
    .order("ultimo_mensaje_en", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error || !c) return null;
  const numero = c.whatsapp_numeros as unknown as { nombre: string } | { nombre: string }[];
  const { mensajes } = await cargarConversacion(supabase, c.id as string, null);
  return {
    conversacionId: c.id as string,
    numero: (Array.isArray(numero) ? numero[0]?.nombre : numero?.nombre) ?? "WhatsApp",
    mensajes: mensajes.slice(-4),
    ultimoEntranteEn: (c.ultimo_entrante_en as string | null) ?? null,
    noLeidos: Number(c.no_leidos ?? 0),
  };
}

/** Los mensajes de una conversación y su dropshipper. Al abrirla (o mientras está abierta) queda leída. */
export async function abrirConversacion(id: string): Promise<{ mensajes: MensajeVista[]; dropshipper: ResumenDropshipper | null } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, id, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  await supabase.from("whatsapp_conversaciones").update({ no_leidos: 0 }).eq("id", id).gt("no_leidos", 0);
  return cargarConversacion(supabase, id, c.dropshipperId);
}

/**
 * Responde por WhatsApp con texto libre. Solo dentro de las 24 h desde el último mensaje del dropshipper (regla de Meta); pasado ese
 * plazo hace falta una plantilla aprobada. Queda en la conversación con quién lo mandó, y si nadie la llevaba, la toma quien responde.
 */
export async function enviarWhatsapp(id: string, texto: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const cuerpo = String(texto ?? "").trim();
  if (!cuerpo) return { error: "Escribe el mensaje." };
  if (cuerpo.length > MAX_TEXTO) return { error: `El mensaje es muy largo (máximo ${MAX_TEXTO} caracteres).` };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, id, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  if (minutosVentana(c.ultimoEntranteEn) <= 0) return { error: "Pasaron más de 24 h desde su último mensaje: por WhatsApp solo se le puede escribir con una plantilla aprobada." };
  const r = await enviarTextoWhatsapp(c.phoneNumberId, c.telefono, cuerpo);
  if ("error" in r) return { error: r.error };
  const ahora = new Date().toISOString();
  const autor = u.nombre || u.email;
  const { error } = await supabase.from("whatsapp_mensajes").insert({
    conversacion_id: id,
    direccion: "saliente",
    tipo: "texto",
    texto: cuerpo,
    wa_id: r.waId,
    estado: "enviado",
    autor_id: u.id,
    autor_nombre: autor,
    momento: ahora,
  });
  // Ya salió por WhatsApp: si no se pudo anotar, se avisa (no se reintenta, para no mandarlo dos veces).
  if (error) return { error: "Se envió, pero no se pudo guardar en el historial. Recarga la bandeja." };
  await supabase
    .from("whatsapp_conversaciones")
    .update({ ultimo_mensaje_en: ahora, ultimo_texto: resumenMensaje("texto", cuerpo), ultimo_de: "saliente", no_leidos: 0, ...(c.asignadaA ? {} : { asignada_a: u.id }) })
    .eq("id", id);
  return { ok: true };
}

/** Una nota privada en la conversación: la ve el equipo, nunca el dropshipper (no sale por WhatsApp). */
export async function notaWhatsapp(id: string, texto: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const cuerpo = String(texto ?? "").trim();
  if (!cuerpo) return { error: "Escribe la nota." };
  if (cuerpo.length > MAX_TEXTO) return { error: `La nota es muy larga (máximo ${MAX_TEXTO} caracteres).` };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u))) return { error: "Esa conversación no existe o no es de tu área." };
  const { error } = await supabase
    .from("whatsapp_mensajes")
    .insert({ conversacion_id: id, direccion: "nota", tipo: "texto", texto: cuerpo, estado: "enviado", autor_id: u.id, autor_nombre: u.nombre || u.email });
  return error ? { error: "No se pudo guardar la nota." } : { ok: true };
}

/** Marca la conversación resuelta (sale de «Sin responder» aunque tenga no leídos) o la vuelve a abrir. Un mensaje nuevo la reabre sola. */
export async function cambiarEstadoConversacion(id: string, estado: "abierta" | "resuelta"): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (estado !== "abierta" && estado !== "resuelta") return { error: "Estado no válido." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u))) return { error: "Esa conversación no existe o no es de tu área." };
  const { error } = await supabase.from("whatsapp_conversaciones").update({ estado, ...(estado === "resuelta" ? { no_leidos: 0 } : {}) }).eq("id", id);
  return error ? { error: "No se pudo cambiar." } : { ok: true };
}

/** «Tomar» la conversación: queda a cargo de quien la toma (o se suelta, con `soltar`). */
export async function tomarConversacion(id: string, soltar = false): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u))) return { error: "Esa conversación no existe o no es de tu área." };
  const { error } = await supabase.from("whatsapp_conversaciones").update({ asignada_a: soltar ? null : u.id }).eq("id", id);
  return error ? { error: "No se pudo cambiar." } : { ok: true };
}
