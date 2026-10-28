"use server";

import { headers } from "next/headers";
import { getUsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { type AreaCrm } from "@/lib/crm/areas";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { enviarPlantillaWhatsapp, enviarTextoWhatsapp } from "@/lib/whatsapp/api";
import { resumenMensaje } from "@/lib/whatsapp/extraer";
import { rellenar, resolverVariables } from "@/lib/whatsapp/plantillas";
import { COLUMNAS_PLANTILLA, type PlantillaGuardada } from "@/lib/whatsapp/plantillas-servidor";
import { config360, urlWebhook360 } from "@/lib/whatsapp/proveedor";
import { minutosVentana } from "@/lib/whatsapp/ventana";
import { areasDe, cargarBandeja, cargarConversacion, conversacionPermitida, usuarioBandeja, type ConversacionVista, type MensajeVista, type NumeroVista, type ResumenDropshipper } from "./datos-bandeja";

/** WhatsApp acepta hasta 4096 caracteres por mensaje de texto. */
const MAX_TEXTO = 4096;

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
    .select("id, no_leidos, ultimo_entrante_en, whatsapp_numeros(nombre)")
    .eq("dropshipper_id", dropshipperId)
    .in("area", areasDe(u))
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
export async function abrirConversacion(id: string): Promise<{ mensajes: MensajeVista[]; hayAnteriores: boolean; dropshipper: ResumenDropshipper | null } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, id, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  await supabase.from("whatsapp_conversaciones").update({ no_leidos: 0 }).eq("id", id).gt("no_leidos", 0);
  return cargarConversacion(supabase, id, c.dropshipperId);
}

/** «Ver mensajes anteriores»: los 300 de antes de `antesDe` (un chat importado del celular puede tener años de mensajes). */
export async function mensajesAnteriores(id: string, antesDe: string): Promise<{ mensajes: MensajeVista[]; hayAnteriores: boolean } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  if (Number.isNaN(Date.parse(String(antesDe)))) return { error: "Fecha no válida." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u))) return { error: "Esa conversación no existe o no es de tu área." };
  const { mensajes, hayAnteriores } = await cargarConversacion(supabase, id, null, new Date(antesDe).toISOString());
  return { mensajes, hayAnteriores };
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
  const c = await conversacionPermitida(supabase, id, u, true);
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
  if (!(await conversacionPermitida(supabase, id, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
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
  if (!(await conversacionPermitida(supabase, id, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
  const { error } = await supabase.from("whatsapp_conversaciones").update({ estado, ...(estado === "resuelta" ? { no_leidos: 0 } : {}) }).eq("id", id);
  return error ? { error: "No se pudo cambiar." } : { ok: true };
}

const NOMBRE_AREA: Record<AreaCrm, string> = { atencion: "Atención", comercial: "Comercial", direccion: "Dirección" };

/**
 * «Pasar a otra área» (un solo número para todo el equipo, migración 0168): el chat pasa a Atención, Comercial o Dirección y deja de
 * verlo quien no ve esa área. Pide poder escribir en el área donde está; queda una nota en el chat con quién lo pasó, y la auditoría.
 */
export async function pasarConversacionDeArea(id: string, area: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!Object.hasOwn(NOMBRE_AREA, area)) return { error: "Área no válida." };
  const destino = area as AreaCrm;
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, id, u, true);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  if (c.area === destino) return { ok: true };
  const { error } = await supabase.from("whatsapp_conversaciones").update({ area: destino }).eq("id", id);
  if (error) return { error: "No se pudo pasar el chat." };
  const autor = u.nombre || u.email;
  await supabase.from("whatsapp_mensajes").insert({
    conversacion_id: id,
    direccion: "nota",
    tipo: "texto",
    texto: `${autor} pasó este chat de ${NOMBRE_AREA[c.area]} a ${NOMBRE_AREA[destino]}.`,
    estado: "enviado",
    autor_id: u.id,
    autor_nombre: autor,
  });
  await registrarAuditoria({ accion: "pasar_area_whatsapp", entidad: "whatsapp_conversaciones", entidadId: id, detalle: `${NOMBRE_AREA[c.area]} → ${NOMBRE_AREA[destino]}` });
  return { ok: true };
}

/**
 * Marca (o desmarca) que este chat se borró en la app de WhatsApp Business. **No borra nada**: el historial se queda en el sistema y los chats no se
 * pueden borrar (disparador de la migración 0171). Meta no avisa cuando se borra un chat entero en la app, así que lo marca una persona; queda una nota
 * en el chat con quién lo hizo y la auditoría.
 */
export async function marcarChatBorradoEnApp(id: string, borrado: boolean): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
  const autor = u.nombre || u.email;
  const { error } = await supabase
    .from("whatsapp_conversaciones")
    .update(borrado ? { borrada_en_app_en: new Date().toISOString(), borrada_en_app_por: autor } : { borrada_en_app_en: null, borrada_en_app_por: null })
    .eq("id", id);
  if (error) return { error: /borrada_en_app/.test(error.message) ? "Falta correr la migración 0171 (los chats no se borran)." : "No se pudo marcar el chat." };
  await supabase.from("whatsapp_mensajes").insert({
    conversacion_id: id,
    direccion: "nota",
    tipo: "texto",
    texto: borrado ? `${autor} marcó este chat como borrado en la app de WhatsApp Business.` : `${autor} quitó la marca de «borrado en la app de WhatsApp Business».`,
    estado: "enviado",
    autor_id: u.id,
    autor_nombre: autor,
  });
  await registrarAuditoria({ accion: "marcar_chat_borrado_app", entidad: "whatsapp_conversaciones", entidadId: id, detalle: borrado ? "Marcado como borrado en la app" : "Marca quitada" });
  return { ok: true };
}

/** «Tomar» la conversación: queda a cargo de quien la toma (o se suelta, con `soltar`). */
export async function tomarConversacion(id: string, soltar = false): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
  const { error } = await supabase.from("whatsapp_conversaciones").update({ asignada_a: soltar ? null : u.id }).eq("id", id);
  return error ? { error: "No se pudo cambiar." } : { ok: true };
}

/**
 * Registra en 360dialog la dirección del webhook del sistema (`/api/whatsapp/360dialog/<D360_WEBHOOK_CLAVE>`), para que le mande los
 * mensajes del número. Solo quien administra el sistema (Usuarios y roles, con edición). La dirección es la del sitio desde donde se pulsa
 * el botón, o `D360_WEBHOOK_BASE` si está puesta.
 */
export async function conectarWebhook360(): Promise<{ ok: true } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u || !esAdministrador(u)) return { error: "Solo quien administra el sistema puede conectar el webhook." };
  const d360 = config360();
  if (!d360) return { error: "Falta la clave de 360dialog (D360_API_KEY) en el servidor." };
  const clave = process.env.D360_WEBHOOK_CLAVE;
  if (!clave || clave.length < 16) return { error: "Falta la palabra secreta del webhook (D360_WEBHOOK_CLAVE, de 16 caracteres o más) en el servidor." };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const base = process.env.D360_WEBHOOK_BASE?.replace(/\/+$/, "") || (host ? `https://${host}` : null);
  if (!base || !/^https:\/\//.test(base)) return { error: "No se pudo saber la dirección del sistema." };
  let r: Response;
  try {
    r = await fetch(urlWebhook360(d360), {
      method: "POST",
      headers: { "D360-API-KEY": d360.clave, "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${base}/api/whatsapp/360dialog/${encodeURIComponent(clave)}` }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { error: "No se pudo conectar con 360dialog. Inténtalo de nuevo." };
  }
  if (r.status === 401 || r.status === 403) return { error: "360dialog rechazó la clave (D360_API_KEY). Revísala en el servidor." };
  if (!r.ok) return { error: `360dialog no aceptó el webhook (código ${r.status}).` };
  await registrarAuditoria({ accion: "conectar_webhook_360dialog", entidad: "whatsapp_conversaciones", detalle: d360.sandbox ? "Sandbox" : "Producción" });
  return { ok: true };
}

/** Una plantilla aprobada, lista para mandarle a esta persona: con lo que el sistema ya sabe de ella en cada variable y lo que falta escribir. */
export interface PlantillaParaEnviar {
  id: string;
  nombre: string;
  /** La categoría que le puso Meta. */
  categoria: string;
  encabezado: string | null;
  cuerpo: string;
  pie: string | null;
  botones: string[];
  /** El valor de cada variable ({{1}}, {{2}}…): el que el sistema sabe, o vacío si se escribe al enviar. */
  valores: string[];
  /** Qué variables se escriben al enviar, y cómo se llaman. */
  manual: boolean[];
  etiquetas: string[];
  /** Por qué no se puede mandar a esta persona (le falta un dato en el CRM), o null. */
  faltante: string | null;
  /** Ya se le mandó esta misma plantilla en las últimas 24 h. */
  yaEnviada: boolean;
}

type UnoDs<T> = T | T[] | null;

/** El nombre y la tienda de la persona del chat, para llenar las variables: su ficha del CRM o, si no está, el nombre de su perfil de WhatsApp. */
async function personaDeLaConversacion(supabase: ReturnType<typeof createServiceClient>, id: string): Promise<{ nombre: string | null; tienda: string | null }> {
  const { data } = await supabase.from("whatsapp_conversaciones").select("nombre_perfil, dropshippers(nombre, tiendas, tienda)").eq("id", id).maybeSingle();
  const ds = data?.dropshippers as UnoDs<{ nombre: string | null; tiendas: string[] | null; tienda: string | null }> | undefined;
  const d = Array.isArray(ds) ? (ds[0] ?? null) : (ds ?? null);
  return { nombre: d?.nombre ?? (data?.nombre_perfil as string | null) ?? null, tienda: d?.tiendas?.[0] ?? d?.tienda ?? null };
}

/** Las plantillas que Meta aprobó, con sus datos ya llenos para este chat (para «Enviar plantilla»). */
export async function plantillasParaConversacion(id: string): Promise<{ plantillas: PlantillaParaEnviar[] } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
  const { data, error } = await supabase.from("whatsapp_plantillas").select(COLUMNAS_PLANTILLA).eq("estado", "aprobada").order("nombre");
  if (error) return { error: "Falta correr la migración 0170 (plantillas de WhatsApp)." };
  const aprobadas = (data ?? []) as PlantillaGuardada[];
  if (!aprobadas.length) return { plantillas: [] };
  const persona = await personaDeLaConversacion(supabase, id);
  const desde = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: previas } = await supabase
    .from("whatsapp_mensajes")
    .select("plantilla_id")
    .eq("conversacion_id", id)
    .eq("direccion", "saliente")
    .gte("momento", desde)
    .in("plantilla_id", aprobadas.map((p) => p.id));
  const yaMandadas = new Set((previas ?? []).map((m) => m.plantilla_id as string));
  return {
    plantillas: aprobadas.map((p) => {
      const variables = p.variables ?? [];
      const automaticas = resolverVariables(variables.filter((v) => v.campo !== "manual"), persona);
      return {
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria_actual ?? p.categoria,
        encabezado: p.encabezado,
        cuerpo: p.cuerpo,
        pie: p.pie,
        botones: p.botones ?? [],
        valores: variables.map((v) => {
          if (v.campo === "manual") return "";
          const r = resolverVariables([v], persona);
          return "valores" in r ? r.valores[0] : "";
        }),
        manual: variables.map((v) => v.campo === "manual"),
        etiquetas: variables.map((v) => v.etiqueta?.trim() || ""),
        faltante: "error" in automaticas ? automaticas.error : null,
        yaEnviada: yaMandadas.has(p.id),
      };
    }),
  };
}

/**
 * Le manda una plantilla aprobada a esta persona (la única forma de escribirle pasadas 24 h de su último mensaje). Los datos de su ficha
 * llenan las variables; las «manual» se escriben al enviar (`manuales`, una por variable, en orden). No se manda la misma plantilla dos
 * veces a la misma persona en 24 h: repetir un mensaje es lo que más reportes causa.
 */
export async function enviarPlantillaConversacion(id: string, plantillaId: string, manuales: string[]): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!/^[0-9a-f-]{36}$/i.test(String(plantillaId))) return { error: "Plantilla no válida." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, id, u, true);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  const { data } = await supabase.from("whatsapp_plantillas").select(COLUMNAS_PLANTILLA).eq("id", plantillaId).maybeSingle();
  const p = data as PlantillaGuardada | null;
  if (!p) return { error: "La plantilla ya no existe." };
  if (p.estado !== "aprobada") return { error: "Meta todavía no aprobó esa plantilla (o la pausó): no se puede enviar." };
  const desde = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { count } = await supabase.from("whatsapp_mensajes").select("id", { count: "exact", head: true }).eq("conversacion_id", id).eq("direccion", "saliente").eq("plantilla_id", p.id).gte("momento", desde);
  if (count) return { error: "Ya le mandaste esta plantilla hoy. Repetirla es lo que más reportes causa: espera su respuesta." };
  const valores = resolverVariables(p.variables ?? [], await personaDeLaConversacion(supabase, id), Array.isArray(manuales) ? manuales.map(String) : []);
  if ("error" in valores) return valores;
  const r = await enviarPlantillaWhatsapp(c.phoneNumberId, c.telefono, p.nombre, p.idioma, valores.valores);
  if ("error" in r) return r;
  const texto = [p.encabezado, rellenar(p.cuerpo, valores.valores)].filter(Boolean).join("\n");
  const ahora = new Date().toISOString();
  const autor = u.nombre || u.email;
  const { error } = await supabase.from("whatsapp_mensajes").insert({
    conversacion_id: id,
    direccion: "saliente",
    tipo: "plantilla",
    texto,
    wa_id: r.waId,
    estado: "enviado",
    plantilla_id: p.id,
    autor_id: u.id,
    autor_nombre: autor,
    momento: ahora,
  });
  if (error) return { error: "Se envió, pero no se pudo guardar en el historial. Recarga la bandeja." };
  await supabase
    .from("whatsapp_conversaciones")
    .update({ ultimo_mensaje_en: ahora, ultimo_texto: resumenMensaje("plantilla", texto), ultimo_de: "saliente", no_leidos: 0, ...(c.asignadaA ? {} : { asignada_a: u.id }) })
    .eq("id", id);
  await registrarAuditoria({ accion: "enviar_plantilla_whatsapp", entidad: "whatsapp_conversaciones", entidadId: id, detalle: p.nombre });
  return { ok: true };
}
