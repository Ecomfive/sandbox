"use server";

import { createHash } from "node:crypto";
import { registrarAuditoria } from "@/lib/auditoria";
import { accesoCrm, escribeEnArea, type AreaCrm } from "@/lib/crm/areas";
import { normalizarTelefono } from "@/lib/crm/telefono";
import { dropshipperPorTelefonos } from "@/lib/whatsapp/vinculo";
import { createServiceClient } from "@/lib/supabase/server";
import { resumenMensaje } from "@/lib/whatsapp/extraer";
import { aUtc, tipoDeArchivo, type TipoImportado } from "@/lib/whatsapp/importar";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

// «Importar chat» de la bandeja (pedido de Hernán, 28 oct 2026): el historial que quedó en el celular de la empresa, exportado chat por
// chat con «Exportar chat» de WhatsApp. El navegador lee el archivo (src/lib/whatsapp/importar.ts y zip.ts) y manda los mensajes por
// lotes; las fotos, audios y documentos los sube él mismo al bucket «whatsapp-importados» (migración 0169) con un permiso firmado.

const BUCKET_IMPORTADOS = "whatsapp-importados";
const MAX_LOTE = 500;
const MAX_TEXTO = 20_000;
const TIPOS: TipoImportado[] = ["texto", "imagen", "audio", "video", "sticker", "documento"];

/** Un mensaje del chat exportado como lo manda el navegador; `n` cuenta los iguales anteriores (`numerarRepetidos`). */
export interface MensajeAImportar {
  local: string;
  autor: string;
  texto: string | null;
  archivo: string | null;
  tipo: TipoImportado;
  n: number;
}

/** Lo que se importó de un lote. `archivos`: el id de cada mensaje nuevo que espera su archivo, por el nombre del archivo. */
export interface ResultadoLote {
  nuevos: number;
  yaEstaban: number;
  /** Del mismo minuto o después del primer mensaje que llegó al sistema por WhatsApp: esos ya están en la bandeja. */
  posteriores: number;
  archivos: { mensajeId: string; archivo: string }[];
}

const nombreSeguro = (nombre: string) => nombre.replace(/[^\w.-]+/g, "_").slice(-120);

/**
 * El chat donde va lo importado cuando esa persona todavía no ha escrito al número nuevo: se busca por el teléfono y, si no existe, se
 * crea resuelto (no aparece en «Sin responder»; un mensaje nuevo lo reabre solo). Pide poder escribir en el área elegida.
 */
export async function conversacionParaImportar(numeroId: string, telefono: string, area: string, nombre: string | null): Promise<{ id: string; creada: boolean } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!["atencion", "comercial", "direccion"].includes(area) || !escribeEnArea(accesoCrm(u), area as AreaCrm)) return { error: "No puedes escribir en esa área." };
  const tel = normalizarTelefono(telefono);
  if (!tel) return { error: "Escribe el número con el código del país, por ejemplo +58 412 555 0000." };
  if (!/^[0-9a-f-]{36}$/i.test(numeroId)) return { error: "Elige el número de la empresa." };
  const supabase = createServiceClient();
  const { data: numero } = await supabase.from("whatsapp_numeros").select("id").eq("id", numeroId).eq("activo", true).maybeSingle();
  if (!numero) return { error: "Ese número de la empresa no está activo." };
  const { data: existe } = await supabase.from("whatsapp_conversaciones").select("id").eq("numero_id", numeroId).eq("telefono", tel.e164).maybeSingle();
  if (existe) {
    if (!(await conversacionPermitida(supabase, existe.id as string, u, true))) return { error: "Ya hay un chat con ese número, pero es de un área donde no puedes escribir." };
    return { id: existe.id as string, creada: false };
  }
  const dropshipperId = (await dropshipperPorTelefonos(supabase, [tel.e164])).get(tel.e164) ?? null;
  const { data: nueva, error } = await supabase
    .from("whatsapp_conversaciones")
    .insert({
      numero_id: numeroId,
      telefono: tel.e164,
      area,
      nombre_perfil: nombre?.trim().slice(0, 120) || null,
      dropshipper_id: dropshipperId,
      estado: "resuelta",
    })
    .select("id")
    .single();
  if (error || !nueva) return { error: "No se pudo crear el chat." };
  return { id: nueva.id as string, creada: true };
}

/**
 * Guarda un lote de mensajes importados. Los de `nosotros` (los autores que son la empresa) quedan como enviados, los demás como
 * recibidos. Nada se repite: cada uno lleva su huella en `wa_id`, y lo del mismo minuto o posterior al primer mensaje que llegó por
 * WhatsApp se salta (ya está). La hora del celular pasa a UTC con `zona` (minutos: Venezuela −240).
 */
export async function guardarLoteImportado(
  conversacionId: string,
  lote: MensajeAImportar[],
  nosotros: string[],
  zona: number,
  ultimo: boolean,
): Promise<ResultadoLote | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!Array.isArray(lote) || lote.length > MAX_LOTE || !Array.isArray(nosotros)) return { error: "Lote no válido." };
  if (![-240, -300, -360].includes(zona)) return { error: "Zona horaria no válida." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, conversacionId, u, true))) return { error: "Esa conversación no existe o no es de tu área." };

  // El primer mensaje que llegó de verdad (webhook): lo importado tiene que ser de antes de su minuto.
  const { data: primero } = await supabase
    .from("whatsapp_mensajes")
    .select("momento")
    .eq("conversacion_id", conversacionId)
    .neq("direccion", "nota")
    .not("wa_id", "like", "import:%")
    .order("momento", { ascending: true })
    .limit(1)
    .maybeSingle();
  const corte = primero ? Math.floor(Date.parse(primero.momento as string) / 60_000) * 60_000 : Infinity;

  const somos = new Set(nosotros.map((n) => String(n)));
  const filas: Record<string, unknown>[] = [];
  const archivoDe = new Map<string, string>();
  let posteriores = 0;
  for (const m of lote) {
    if (!m || typeof m.local !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(m.local) || typeof m.autor !== "string" || !m.autor.trim()) continue;
    const tipo = TIPOS.includes(m.tipo) ? m.tipo : "texto";
    const texto = typeof m.texto === "string" && m.texto.trim() ? m.texto.slice(0, MAX_TEXTO) : null;
    const archivo = typeof m.archivo === "string" && /^[^/\\]{1,200}$/.test(m.archivo) ? m.archivo : null;
    if (!texto && !archivo) continue;
    const momento = aUtc(m.local, zona);
    if (Date.parse(momento) >= corte) {
      posteriores++;
      continue;
    }
    const autor = m.autor.trim().slice(0, 120);
    const n = Number.isInteger(m.n) && m.n >= 0 ? m.n : 0;
    const huella = createHash("sha256").update([conversacionId, m.local, autor, texto ?? "", archivo ?? "", n].join("\u0000")).digest("hex").slice(0, 40);
    const waId = `import:${huella}`;
    const nuestro = somos.has(m.autor);
    if (archivo) archivoDe.set(waId, archivo);
    filas.push({
      conversacion_id: conversacionId,
      direccion: nuestro ? "saliente" : "entrante",
      tipo: archivo ? tipo : "texto",
      texto,
      media_nombre: archivo,
      media_mime: archivo ? tipoDeArchivo(archivo).mime : null,
      wa_id: waId,
      estado: nuestro ? "enviado" : "recibido",
      autor_nombre: autor,
      momento,
    });
  }

  let nuevos: { id: string; wa_id: string; momento: string; tipo: string; texto: string | null; direccion: string }[] = [];
  if (filas.length) {
    // Una huella repetida (el mismo chat importado otra vez) no se vuelve a guardar: solo vuelven las filas nuevas.
    const { data, error } = await supabase.from("whatsapp_mensajes").upsert(filas, { onConflict: "wa_id", ignoreDuplicates: true }).select("id, wa_id, momento, tipo, texto, direccion");
    if (error) return { error: "No se pudieron guardar los mensajes." };
    nuevos = (data ?? []) as typeof nuevos;
  }

  // Si el chat no tenía nada más nuevo (uno creado para importar), su último mensaje en la lista es el último importado.
  const masNuevo = nuevos.reduce<(typeof nuevos)[number] | null>((a, b) => (!a || b.momento > a.momento ? b : a), null);
  if (masNuevo) {
    await supabase
      .from("whatsapp_conversaciones")
      .update({ ultimo_mensaje_en: masNuevo.momento, ultimo_texto: resumenMensaje(masNuevo.tipo, masNuevo.texto), ultimo_de: masNuevo.direccion })
      .eq("id", conversacionId)
      .or(`ultimo_mensaje_en.is.null,ultimo_mensaje_en.lt.${masNuevo.momento}`);
  }
  if (ultimo) await registrarAuditoria({ accion: "importar_chat_whatsapp", entidad: "whatsapp_conversaciones", entidadId: conversacionId, detalle: "Chat exportado desde el celular" });

  // Los que ya estaban de una importación anterior y siguen sin su archivo (no venía o no se subió): se piden otra vez.
  const yaGuardados = new Set(nuevos.map((f) => f.wa_id));
  const pendientes = [...archivoDe.keys()].filter((w) => !yaGuardados.has(w));
  const sinArchivo: { id: string; wa_id: string }[] = [];
  for (let i = 0; i < pendientes.length; i += 100) {
    const { data } = await supabase.from("whatsapp_mensajes").select("id, wa_id").eq("conversacion_id", conversacionId).is("media_id", null).in("wa_id", pendientes.slice(i, i + 100));
    sinArchivo.push(...((data ?? []) as typeof sinArchivo));
  }

  return {
    nuevos: nuevos.length,
    yaEstaban: filas.length - nuevos.length,
    posteriores,
    archivos: [...nuevos, ...sinArchivo].filter((f) => archivoDe.has(f.wa_id)).map((f) => ({ mensajeId: f.id, archivo: archivoDe.get(f.wa_id)! })),
  };
}

/** El mensaje importado si esta persona puede escribir en su chat y todavía espera su archivo. */
async function mensajeImportado(mensajeId: string) {
  const u = await usuarioBandeja(true);
  if (!u || !/^[0-9a-f-]{36}$/i.test(mensajeId)) return null;
  const supabase = createServiceClient();
  const { data: m } = await supabase.from("whatsapp_mensajes").select("id, conversacion_id, wa_id, media_id, media_nombre").eq("id", mensajeId).maybeSingle();
  if (!m || !String(m.wa_id ?? "").startsWith("import:") || m.media_id || !m.media_nombre) return null;
  if (!(await conversacionPermitida(supabase, m.conversacion_id as string, u, true))) return null;
  return { supabase, ruta: `${m.conversacion_id}/${m.id}-${nombreSeguro(m.media_nombre as string)}` };
}

/** Permiso (URL firmada) para que el navegador suba el archivo de un mensaje importado directo al bucket, sin pasar por la acción. */
export async function permisoArchivoImportado(mensajeId: string): Promise<{ ruta: string; token: string } | { error: string }> {
  const m = await mensajeImportado(mensajeId);
  if (!m) return { error: "Ese mensaje no espera un archivo." };
  const { data, error } = await m.supabase.storage.from(BUCKET_IMPORTADOS).createSignedUploadUrl(m.ruta, { upsert: true });
  if (error || !data) return { error: /bucket/i.test(error?.message ?? "") ? "Falta correr la migración 0169 (archivos importados)." : "No se pudo preparar la subida." };
  return { ruta: m.ruta, token: data.token };
}

/** Ya subido: el mensaje queda con su archivo (`storage:<ruta>`, lo sirve /api/whatsapp/media). */
export async function archivoImportadoListo(mensajeId: string): Promise<{ ok: true } | { error: string }> {
  const m = await mensajeImportado(mensajeId);
  if (!m) return { error: "Ese mensaje no espera un archivo." };
  const carpeta = m.ruta.slice(0, m.ruta.lastIndexOf("/"));
  const { data: hay } = await m.supabase.storage.from(BUCKET_IMPORTADOS).list(carpeta, { search: m.ruta.slice(carpeta.length + 1), limit: 1 });
  if (!hay?.length) return { error: "El archivo no llegó." };
  const { error } = await m.supabase.from("whatsapp_mensajes").update({ media_id: `storage:${m.ruta}` }).eq("id", mensajeId);
  return error ? { error: "No se pudo enlazar el archivo." } : { ok: true };
}
