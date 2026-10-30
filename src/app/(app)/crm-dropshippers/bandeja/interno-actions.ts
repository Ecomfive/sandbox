"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { accesoCrm, escribeEnArea } from "@/lib/crm/areas";
import { areaPropiaDeChat, AREAS_DE_SALA, esSala, etiquetaDeSala, telefonoDeSala } from "@/lib/crm/chat-interno";
import { nombreArchivoSeguro } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { detectarArchivoWhatsapp, MAX_BYTES_ENVIO } from "@/lib/whatsapp/archivos";
import { avisarBandeja } from "@/lib/whatsapp/aviso-bandeja";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";
import { BUCKET_ARCHIVOS, permisoDeSubida } from "./enviar-medio";

/**
 * «Chat interno» por salas (30 oct 2026, pedido de Jhokser): cada persona elige con qué área habla —Atención, Comercial o Dirección— o con todas a la vez (la sala `ac`, `ad`,
 * `cd` o `acd`, `src/lib/crm/chat-interno.ts`). Abre **la copia de su propia área** de esa sala (la crea si no existe) y devuelve su id. No hace falta un número de WhatsApp
 * para el área —Dirección puede no tener uno— y nada sale a WhatsApp: se escribe con `enviarMensajeInterno` y `enviarArchivoInterno`, sin las 24 h ni las plantillas de Meta.
 * Hay que poder escribir en el área propia y que esa sala incluya a esa área.
 */
export async function abrirChatInterno(sala: string): Promise<{ id: string } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!esSala(sala)) return { error: "Elige con qué área quieres hablar." };
  const acceso = accesoCrm(u);
  const mia = areaPropiaDeChat(acceso);
  if (!AREAS_DE_SALA[sala].includes(mia)) return { error: "Ese chat no es de tu área." };
  if (!escribeEnArea(acceso, mia)) return { error: "No puedes escribir en el chat interno de tu área." };
  const supabase = createServiceClient();
  const telefono = telefonoDeSala(sala, mia);
  const { data: existe } = await supabase.from("whatsapp_conversaciones").select("id").eq("telefono", telefono).limit(1).maybeSingle();
  if (existe) return { id: existe.id as string };
  // La conversación cuelga de algún número activo (la tabla lo pide); el chat interno no lo usa: se prefiere el de la misma área.
  const { data: numeros } = await supabase.from("whatsapp_numeros").select("id, area").eq("activo", true);
  const ancla = (numeros ?? []).find((n) => n.area === mia) ?? (numeros ?? [])[0];
  if (!ancla) return { error: "No hay un número de WhatsApp activo al que sujetar el chat interno." };
  const { data: nueva, error } = await supabase
    .from("whatsapp_conversaciones")
    .insert({ numero_id: ancla.id, telefono, area: mia, nombre_perfil: etiquetaDeSala(sala, mia), estado: "resuelta" })
    .select("id")
    .single();
  if (error || !nueva) {
    // Dos personas del área abriéndolo a la vez: gana la que ya lo creó.
    const { data: otra } = await supabase.from("whatsapp_conversaciones").select("id").eq("telefono", telefono).limit(1).maybeSingle();
    return otra ? { id: otra.id as string } : { error: "No se pudo abrir el chat interno." };
  }
  await registrarAuditoria({ accion: "abrir_chat_interno", entidad: "whatsapp_conversaciones", entidadId: nueva.id as string, detalle: `${etiquetaDeSala(sala, mia)} (sala ${sala})` });
  return { id: nueva.id as string };
}

/** Lo que dice `whatsapp_enviar_interno` (migración 0203) cuando falla, en palabras. */
function errorInterno(mensaje: string): string {
  if (/no_es_chat_interno|sala_no_valida/.test(mensaje)) return "Este no es un chat interno.";
  if (/tipo_no_valido|falta_archivo/.test(mensaje)) return "En el chat interno solo se mandan texto, fotos y audios.";
  if (/whatsapp_enviar_interno|schema cache|does not exist/i.test(mensaje)) return "Falta correr la migración 0203 (chat interno por salas).";
  return "No se pudo mandar el mensaje.";
}

type Guardado = { ok: true; mensajeId: string; momento: string } | { error: string };

/**
 * Guarda un mensaje del chat interno: **no sale por WhatsApp**, así no pesan las reglas de Meta (la ventana de 24 h, las plantillas, el primer contacto, el costo y la calidad del
 * número). `whatsapp_enviar_interno` (migración 0203) lo guarda, en una sola transacción, en la copia de cada área de la sala y en las de las otras áreas lo cuenta como no leído.
 */
async function guardarInterno(id: string, args: { texto: string; tipo?: "texto" | "imagen" | "audio"; mediaId?: string; mime?: string; nombre?: string }): Promise<Guardado> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
  const { data, error } = await supabase.rpc("whatsapp_enviar_interno", {
    p_conversacion: id,
    p_texto: args.texto,
    p_autor_id: u.id,
    p_autor_nombre: u.nombre || u.email,
    p_tipo: args.tipo ?? "texto",
    p_media_id: args.mediaId ?? null,
    p_media_mime: args.mime ?? null,
    p_media_nombre: args.nombre ?? null,
  });
  if (error) return { error: errorInterno(error.message) };
  const fila = (Array.isArray(data) ? data[0] : data) as { o_mensaje?: string; o_momento?: string } | null;
  if (!fila?.o_mensaje) return { error: "No se pudo mandar el mensaje." };
  await avisarBandeja();
  return { ok: true, mensajeId: fila.o_mensaje, momento: fila.o_momento ?? new Date().toISOString() };
}

/** Un mensaje de texto del chat interno. Devuelve el error como valor. */
export async function enviarMensajeInterno(id: string, texto: string): Promise<Guardado> {
  const cuerpo = String(texto ?? "").trim();
  if (!cuerpo) return { error: "Escribe el mensaje." };
  if (cuerpo.length > 4096) return { error: "El mensaje es muy largo (máximo 4096 caracteres)." };
  return guardarInterno(id, { texto: cuerpo });
}

/**
 * Primer paso de mandar una foto o un audio por el chat interno: el permiso firmado para que el navegador lo suba directo al almacén (una acción del servidor no admite archivos
 * grandes). Va a `interno/<uuid>-nombre`: una sola copia que ven todas las áreas de la sala. Todavía no se manda nada: `enviarArchivoInterno` revisa el contenido.
 */
export async function prepararArchivoInterno(id: string, nombre: string, tamano: number): Promise<{ ruta: string; token: string } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
  if (!Number.isFinite(tamano) || tamano <= 0) return { error: "El archivo está vacío." };
  if (tamano > MAX_BYTES_ENVIO) return { error: `El archivo pesa más de ${MAX_BYTES_ENVIO / 1024 / 1024} MB.` };
  const ruta = `interno/${crypto.randomUUID()}-${nombreArchivoSeguro(nombre)}`;
  const permiso = await permisoDeSubida(supabase, ruta);
  if ("error" in permiso) return permiso;
  return { ruta, token: permiso.token };
}

/**
 * Segundo paso: guarda en el chat interno la foto o el audio que el navegador ya subió. Se revisa **por su contenido** que sea una foto (JPG o PNG) o un audio (nunca por su nombre
 * ni su tipo) y que no pese de más; con un texto al pie en las fotos. Si algo falla, el archivo subido se borra.
 */
export async function enviarArchivoInterno(id: string, ruta: string, nombre: string, texto: string): Promise<Guardado> {
  if (typeof ruta !== "string" || !/^interno\/[0-9a-f-]{36}-[^/]+$/i.test(ruta) || ruta.includes("..")) return { error: "Archivo no válido." };
  const supabase = createServiceClient();
  const quitar = () => supabase.storage.from(BUCKET_ARCHIVOS).remove([ruta]);
  const u = await usuarioBandeja(true);
  if (!u || !(await conversacionPermitida(supabase, id, u, true))) {
    await quitar();
    return { error: "Esa conversación no existe o no es de tu área." };
  }
  const { data: archivo, error: errorBajada } = await supabase.storage.from(BUCKET_ARCHIVOS).download(ruta);
  if (errorBajada || !archivo) return { error: "El archivo no llegó. Inténtalo de nuevo." };
  if (archivo.size > MAX_BYTES_ENVIO) {
    await quitar();
    return { error: `El archivo pesa más de ${MAX_BYTES_ENVIO / 1024 / 1024} MB.` };
  }
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const nombreMostrado = String(nombre ?? "").replace(/[\\/\u0000-\u001f]/g, "").trim().slice(-120) || "archivo";
  const clase = detectarArchivoWhatsapp(bytes, nombreMostrado);
  if ("error" in clase) {
    await quitar();
    return { error: clase.error };
  }
  if (clase.tipo !== "imagen" && clase.tipo !== "audio") {
    await quitar();
    return { error: "En el chat interno solo se mandan fotos y audios." };
  }
  const pie = clase.tipo === "imagen" ? String(texto ?? "").trim().slice(0, 1024) : "";
  const r = await guardarInterno(id, { texto: pie, tipo: clase.tipo, mediaId: `storage:${ruta}`, mime: clase.mime, nombre: nombreMostrado });
  if ("error" in r) await quitar();
  return r;
}
