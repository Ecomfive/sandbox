"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { accesoCrm, pierdeLoBorrado } from "@/lib/crm/areas";
import { createServiceClient } from "@/lib/supabase/server";
import { archivoDeMensaje } from "@/lib/whatsapp/archivo-mensaje";
import { mensajeVisibleParaAtencion } from "@/lib/whatsapp/borrados-atencion";
import { corteDeBorradoEnApp, estaOculto, mensajesEliminadosEnWhatsapp } from "@/lib/whatsapp/ocultos";
import { MAX_BYTES_AUDIO } from "@/lib/whatsapp/transcripcion";
import { transcribirConIA } from "@/lib/whatsapp/transcribir-ia";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/**
 * Transcribe un audio del chat (pedido de Jhokser, 30 oct 2026): baja el audio, lo pasa por la IA (`transcribirConIA`, OpenAI o Gemini; **cuesta crédito** y queda en
 * «Consumo de IA»), guarda el texto en el mensaje (migración 0200) y lo devuelve. Si ya estaba transcrito, devuelve lo guardado sin volver a pagar. Hay que poder
 * escribir en el CRM y ver ese chat; no se transcribe lo que se autorizó ocultar ni, para quien tiene solo Atención, lo que se borró en WhatsApp. Devuelve el error como valor.
 */
export async function transcribirAudio(mensajeId: string): Promise<{ texto: string } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para transcribir audios." };
  if (!ES_ID(mensajeId)) return { error: "Mensaje no válido." };
  const supabase = createServiceClient();
  const { data: m, error } = await supabase
    .from("whatsapp_mensajes")
    .select("id, conversacion_id, tipo, media_id, media_mime, media_nombre, momento, transcripcion")
    .eq("id", mensajeId)
    .maybeSingle();
  if (error) return { error: /transcripcion/.test(error.message) ? "Falta correr la migración 0200 (transcripción de audios)." : "No se pudo leer el mensaje." };
  if (!m || m.tipo !== "audio" || !m.media_id) return { error: "Ese mensaje no es un audio." };
  const conversacionId = m.conversacion_id as string;
  const c = await conversacionPermitida(supabase, conversacionId, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  if (await estaOculto(supabase, mensajeId, conversacionId)) return { error: "Ese audio ya no está disponible." };
  if (pierdeLoBorrado(accesoCrm(u))) {
    const [eliminados, corte] = await Promise.all([mensajesEliminadosEnWhatsapp(supabase, conversacionId), corteDeBorradoEnApp(supabase, conversacionId)]);
    if (!mensajeVisibleParaAtencion({ id: mensajeId, momento: String(m.momento) }, eliminados, corte)) return { error: "Ese audio ya no está disponible." };
  }
  if (m.transcripcion) return { texto: m.transcripcion as string };

  const archivo = await archivoDeMensaje(supabase, { conversacion_id: conversacionId, media_id: m.media_id as string, media_mime: (m.media_mime as string | null) ?? null }, c.numeroEmpresa, MAX_BYTES_AUDIO);
  if ("estado" in archivo) {
    return { error: archivo.estado === 410 ? "El audio ya no está en WhatsApp (se guarda unos 30 días)." : archivo.estado === 413 ? "El audio es demasiado largo para transcribirlo." : "No se pudo traer el audio." };
  }
  const bytes = archivo.bytes instanceof Uint8Array ? archivo.bytes : new Uint8Array(archivo.bytes);
  const r = await transcribirConIA(bytes, archivo.mime || String(m.media_mime ?? ""), (m.media_nombre as string | null) ?? null, {
    operacion: "transcribir_audio",
    modulo: "crm-dropshippers",
    usuario: { id: u.id, nombre: u.nombre ?? null, email: u.email },
    referencia: mensajeId,
  });
  if ("error" in r) return r;

  // Solo si nadie la guardó mientras tanto (dos personas pulsando a la vez no se pisan).
  await supabase
    .from("whatsapp_mensajes")
    .update({ transcripcion: r.texto, transcripcion_en: new Date().toISOString(), transcripcion_modelo: r.modelo, transcripcion_por: u.nombre || u.email })
    .eq("id", mensajeId)
    .is("transcripcion", null);
  await registrarAuditoria({ accion: "transcribir_audio_whatsapp", entidad: "whatsapp_conversaciones", entidadId: conversacionId, detalle: "Transcribió un audio" });
  return { texto: r.texto };
}
