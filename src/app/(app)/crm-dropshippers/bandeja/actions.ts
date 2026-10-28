"use server";

import { headers } from "next/headers";
import { getUsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { type AreaCrm } from "@/lib/crm/areas";
import { accionBandejaBloqueada, permisosBandeja } from "@/lib/crm/permisos-bandeja";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { nombreSeguro } from "@/lib/compras/adjuntos";
import { enviarArchivoWhatsapp, enviarTextoWhatsapp } from "@/lib/whatsapp/api";
import { BUCKET_WHATSAPP, detectarArchivoWhatsapp, excedeTamano, MAX_BYTES_WHATSAPP } from "@/lib/whatsapp/archivos";
import { resumenMensaje } from "@/lib/whatsapp/extraer";
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
  let consulta = supabase
    .from("whatsapp_conversaciones")
    .select("id, no_leidos, ultimo_entrante_en, whatsapp_numeros(nombre)")
    .eq("dropshipper_id", dropshipperId)
    .in("area", areasDe(u));
  // Lo afinado: con «los suyos y los libres», la ficha tampoco muestra el chat que lleva otra persona.
  if (permisosBandeja(u.afinado).alcance === "mias-y-libres") consulta = consulta.or(`asignada_a.is.null,asignada_a.eq.${u.id}`);
  const { data: c, error } = await consulta.order("ultimo_mensaje_en", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
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
  const bloqueada = accionBandejaBloqueada(u.afinado, "responder");
  if (bloqueada) return { error: bloqueada };
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

/** WhatsApp acepta pies de foto o video de hasta 1024 caracteres. */
const MAX_PIE = 1024;

/**
 * Da permiso (URL firmada) para que el navegador suba una foto, un video o un documento al bucket `whatsapp` (migración 0170), en la
 * carpeta de esa conversación: el servidor no recibe archivos grandes. El archivo se revisa de verdad al mandarlo.
 */
export async function prepararArchivoWhatsapp(id: string, nombre: string, bytes: number): Promise<{ ruta: string; token: string } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const bloqueada = accionBandejaBloqueada(u.afinado, "archivos");
  if (bloqueada) return { error: bloqueada };
  if (typeof nombre !== "string" || !nombre.trim()) return { error: "El archivo no tiene nombre." };
  if (!Number.isFinite(bytes) || bytes <= 0) return { error: "El archivo está vacío." };
  if (bytes > MAX_BYTES_WHATSAPP.document) return { error: "Por WhatsApp los archivos pesan hasta 100 MB." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, id, u, true);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  if (minutosVentana(c.ultimoEntranteEn) <= 0) return { error: "Pasaron más de 24 h desde su último mensaje: por WhatsApp solo se le puede escribir con una plantilla aprobada." };
  const ruta = `salientes/${id}/${crypto.randomUUID()}-${nombreSeguro(nombre)}`;
  const { data, error } = await supabase.storage.from(BUCKET_WHATSAPP).createSignedUploadUrl(ruta);
  if (error || !data) return { error: "No se pudo preparar la subida. ¿Ya se corrió la migración 0170?" };
  return { ruta, token: data.token };
}

/**
 * Manda por WhatsApp un archivo ya subido con `prepararArchivoWhatsapp`, con su pie de texto. Se revisa que sea de la carpeta de esa
 * conversación, su contenido (foto JPG/PNG, video MP4, documento) y su peso; se guarda con su tipo real y WhatsApp lo baja de un
 * enlace firmado de una hora. Si algo falla, el archivo se borra.
 */
export async function mandarArchivoWhatsapp(id: string, ruta: string, nombre: string, pie: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const bloqueada = accionBandejaBloqueada(u.afinado, "archivos");
  if (bloqueada) return { error: bloqueada };
  const supabase = createServiceClient();
  const storage = supabase.storage.from(BUCKET_WHATSAPP);
  const carpeta = `salientes/${id}/`;
  const propia = typeof ruta === "string" && ruta.startsWith(carpeta) && !ruta.includes("..") && ruta.length <= 300;
  const falla = async (error: string) => {
    if (propia) await storage.remove([ruta]);
    return { error };
  };
  if (!propia) return { error: "Ese archivo no es de esta conversación." };
  // Sin acceso a la conversación o con el archivo ya mandado no se borra nada: solo lo que se puede mandar se limpia al fallar.
  const c = await conversacionPermitida(supabase, id, u, true);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  const { count } = await supabase.from("whatsapp_mensajes").select("id", { count: "exact", head: true }).eq("media_ruta", ruta);
  if (count) return { error: "Ese archivo ya se mandó. Vuelve a adjuntarlo." };
  if (minutosVentana(c.ultimoEntranteEn) <= 0) return falla("Pasaron más de 24 h desde su último mensaje: por WhatsApp solo se le puede escribir con una plantilla aprobada.");
  const texto = String(pie ?? "").trim();
  if (texto.length > MAX_PIE) return falla(`El texto que acompaña el archivo es muy largo (máximo ${MAX_PIE} caracteres).`);

  const { data, error } = await storage.download(ruta);
  if (error || !data) return falla("No se encontró el archivo. Vuelve a adjuntarlo.");
  const contenido = new Uint8Array(await data.arrayBuffer());
  const nombreArchivo = String(nombre ?? "").trim().slice(0, 120) || "archivo";
  const tipo = detectarArchivoWhatsapp(contenido, nombreArchivo);
  if ("error" in tipo) return falla(tipo.error);
  const pesado = excedeTamano(tipo.tipoWa, contenido.byteLength);
  if (pesado) return falla(pesado);
  // Se guarda con el tipo que corresponde a su contenido, no el que mandó el navegador.
  if ((data.type || "").split(";")[0] !== tipo.mime) {
    const { error: errorTipo } = await storage.update(ruta, contenido, { contentType: tipo.mime, upsert: true });
    if (errorTipo) return falla("No se pudo guardar el archivo.");
  }
  const { data: firmado } = await storage.createSignedUrl(ruta, 3600);
  if (!firmado?.signedUrl) return falla("No se pudo preparar el archivo para WhatsApp.");

  const r = await enviarArchivoWhatsapp(c.phoneNumberId, c.telefono, { tipoWa: tipo.tipoWa, enlace: firmado.signedUrl, texto: texto || null, nombre: nombreArchivo });
  if ("error" in r) return falla(r.error);
  const ahora = new Date().toISOString();
  const { error: errorGuardar } = await supabase.from("whatsapp_mensajes").insert({
    conversacion_id: id,
    direccion: "saliente",
    tipo: tipo.tipo,
    texto: texto || null,
    media_ruta: ruta,
    media_mime: tipo.mime,
    media_nombre: tipo.tipoWa === "document" ? nombreArchivo : null,
    wa_id: r.waId,
    estado: "enviado",
    autor_id: u.id,
    autor_nombre: u.nombre || u.email,
    momento: ahora,
  });
  // Ya salió por WhatsApp: si no se pudo anotar, se avisa (no se reintenta, para no mandarlo dos veces).
  if (errorGuardar) return { error: "Se envió, pero no se pudo guardar en el historial. Recarga la bandeja." };
  await supabase
    .from("whatsapp_conversaciones")
    .update({ ultimo_mensaje_en: ahora, ultimo_texto: resumenMensaje(tipo.tipo, texto || null), ultimo_de: "saliente", no_leidos: 0, ...(c.asignadaA ? {} : { asignada_a: u.id }) })
    .eq("id", id);
  return { ok: true };
}

/** Borra un archivo que se subió pero se quitó antes de mandarlo. Solo de la carpeta de esa conversación y si no se mandó. */
export async function descartarArchivoWhatsapp(id: string, ruta: string): Promise<void> {
  const u = await usuarioBandeja(true);
  if (!u || typeof ruta !== "string" || !ruta.startsWith(`salientes/${id}/`) || ruta.includes("..")) return;
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u, true))) return;
  const { count } = await supabase.from("whatsapp_mensajes").select("id", { count: "exact", head: true }).eq("media_ruta", ruta);
  if (!count) await supabase.storage.from(BUCKET_WHATSAPP).remove([ruta]);
}

/** Una nota privada en la conversación: la ve el equipo, nunca el dropshipper (no sale por WhatsApp). */
export async function notaWhatsapp(id: string, texto: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const bloqueada = accionBandejaBloqueada(u.afinado, "notas");
  if (bloqueada) return { error: bloqueada };
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
  const bloqueada = accionBandejaBloqueada(u.afinado, "resolver");
  if (bloqueada) return { error: bloqueada };
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
  const bloqueada = accionBandejaBloqueada(u.afinado, "pasar-area");
  if (bloqueada) return { error: bloqueada };
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

/** «Tomar» la conversación: queda a cargo de quien la toma (o se suelta, con `soltar`). */
export async function tomarConversacion(id: string, soltar = false): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const bloqueada = accionBandejaBloqueada(u.afinado, "tomar");
  if (bloqueada) return { error: bloqueada };
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
