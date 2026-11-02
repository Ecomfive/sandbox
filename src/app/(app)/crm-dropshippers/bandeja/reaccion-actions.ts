"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { enviarReaccionWhatsapp } from "@/lib/whatsapp/api";
import { mensajesOcultos } from "@/lib/whatsapp/ocultos";
import { emojiDeReaccion } from "@/lib/whatsapp/reacciones";
import { chatParaEnviar } from "./enviar-medio";

const ES_ID = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/**
 * Reaccionar a un mensaje del chat con un emoji, como en WhatsApp (29 oct 2026, pedido de Jhokser). Con `emoji` vacío se quita la reacción que el equipo había puesto. Mismas reglas que
 * mandar un mensaje: poder escribir en el chat, no solo supervisarlo y la ventana de 24 h abierta. Solo se reacciona a un mensaje del dropshipper o del equipo que tenga su id de WhatsApp
 * (no a notas privadas, a reacciones, a lo importado del celular ni a lo ocultado). La reacción queda en el chat como cualquier otra (una fila `reaccion` con el id del mensaje) y la
 * bandeja la dibuja sobre ese mensaje; no mueve el chat de lugar en la lista ni cuenta como mensaje sin leer.
 */
export async function reaccionarAMensaje(conversacionId: string, mensajeId: string, emoji: string): Promise<{ ok: true } | { error: string }> {
  const e = await chatParaEnviar(conversacionId);
  if ("error" in e) return e;
  if (!ES_ID(mensajeId)) return { error: "Mensaje no válido." };
  const limpio = emojiDeReaccion(emoji);
  if (limpio === null) return { error: "Elige un emoji para reaccionar." };
  const { u, c, supabase } = e;
  const { data: m } = await createServiceClient().from("whatsapp_mensajes").select("id, direccion, tipo, wa_id").eq("id", mensajeId).eq("conversacion_id", c.id).maybeSingle();
  const waId = (m?.wa_id as string | null) ?? null;
  if (!m || !waId || waId.startsWith("import:") || m.tipo === "reaccion" || (m.direccion !== "entrante" && m.direccion !== "saliente")) return { error: "A ese mensaje no se puede reaccionar." };
  if ((await mensajesOcultos(supabase, c.id)).has(m.id as string)) return { error: "A ese mensaje no se puede reaccionar." };

  const r = await enviarReaccionWhatsapp({ phoneNumberId: c.phoneNumberId, numero: c.numeroEmpresa }, c.telefono, waId, limpio);
  if ("error" in r) return r;
  const { error } = await supabase.from("whatsapp_mensajes").insert({
    conversacion_id: c.id,
    direccion: "saliente",
    tipo: "reaccion",
    texto: limpio || null,
    reaccion_a: waId,
    wa_id: r.waId,
    estado: "enviado",
    autor_id: u.id,
    autor_nombre: u.nombre || u.email,
    momento: new Date().toISOString(),
  });
  // Ya salió por WhatsApp: si no se pudo anotar, se avisa (no se reintenta, para no reaccionar dos veces).
  if (error) return { error: error.code === "42703" ? "Reaccionó, pero falta correr la migración 0186 (reacciones) para verlo aquí." : "Reaccionó, pero no se pudo guardar en el historial. Recarga la bandeja." };
  return { ok: true };
}
