import { normalizarTelefono } from "@/lib/crm/telefono";
import { createServiceClient } from "@/lib/supabase/server";
import { dropshipperPorTelefonos } from "./vinculo";
import { ORDEN_ESTADO, resumenMensaje, type EstadoEntrante, type MensajeEntrante, type RevocadoEntrante } from "./extraer";

/**
 * Guarda los mensajes que llegan por el webhook (migración 0158): cada uno en su conversación (número de la empresa + teléfono del
 * dropshipper), sin repetir los avisos que Meta manda dos veces, y enlazado con el dropshipper del CRM que tiene ese WhatsApp.
 * Con `desdeCelular` son los que el equipo mandó desde la app del celular (coexistencia, migración 0164): se guardan como salientes.
 */
export async function guardarEntrantes(mensajes: MensajeEntrante[], desdeCelular = false): Promise<void> {
  if (!mensajes.length) return;
  const supabase = createServiceClient();
  // El dropshipper de cada teléfono: el CRM guarda el WhatsApp en formato internacional (src/lib/crm/telefono.ts).
  const telefonos = [...new Set(mensajes.map((m) => normalizarTelefono(m.telefono)?.e164 ?? m.telefono))];
  // Su número principal o uno de sus otros números (migración 0177).
  const dropshipperDe = await dropshipperPorTelefonos(supabase, telefonos);
  for (const m of [...mensajes].sort((a, b) => a.momento.localeCompare(b.momento))) {
    const telefono = normalizarTelefono(m.telefono)?.e164 ?? m.telefono;
    const { error } = await supabase.rpc(desdeCelular ? "whatsapp_registrar_saliente_celular" : "whatsapp_registrar_entrante", {
      p_phone_number_id: m.phoneNumberId,
      p_numero: m.numeroEmpresa,
      p_telefono: telefono,
      ...(desdeCelular ? {} : { p_nombre_perfil: m.nombre }),
      p_dropshipper_id: dropshipperDe.get(telefono) ?? null,
      p_wa_id: m.waId,
      p_tipo: m.tipo,
      p_texto: m.texto,
      p_media_id: m.mediaId,
      p_media_mime: m.mediaMime,
      p_media_nombre: m.mediaNombre,
      p_momento: m.momento,
      p_resumen: resumenMensaje(m.tipo, m.texto),
    });
    if (error) console.error(`WhatsApp: no se pudo guardar un mensaje${desdeCelular ? " mandado desde el celular" : ""}`, m.waId, error.message);
  }
  if (!desdeCelular) await volverAMostrarSiOcultos(supabase, telefonos);
}

/**
 * Si un dropshipper escribe a un chat que se había autorizado ocultar (migración 0172), el chat vuelve a verse: nadie se queda sin ser atendido.
 * Deja una nota del sistema. Sin la migración no hace nada.
 */
async function volverAMostrarSiOcultos(supabase: ReturnType<typeof createServiceClient>, telefonos: string[]): Promise<void> {
  const { data, error } = await supabase.from("whatsapp_conversaciones").update({ oculta_en: null, oculta_por: null }).in("telefono", telefonos).not("oculta_en", "is", null).select("id");
  if (error || !data?.length) return;
  await supabase.from("whatsapp_mensajes").insert(
    data.map((c) => ({ conversacion_id: c.id as string, direccion: "nota", tipo: "texto", texto: "Volvió a escribir: el chat vuelve a verse en la bandeja.", estado: "enviado", autor_nombre: "Sistema" })),
  );
}

/** Los estados de los mensajes que mandó el equipo. Un estado nunca vuelve atrás; un «fallido» se guarda con su motivo. */
export async function guardarEstados(estados: EstadoEntrante[]): Promise<void> {
  if (!estados.length) return;
  const supabase = createServiceClient();
  for (const e of estados) {
    if (e.estado === "fallido") {
      await supabase.from("whatsapp_mensajes").update({ estado: "fallido", error: e.error }).eq("wa_id", e.waId);
      continue;
    }
    const anteriores = ORDEN_ESTADO.slice(0, ORDEN_ESTADO.indexOf(e.estado));
    await supabase.from("whatsapp_mensajes").update({ estado: e.estado }).eq("wa_id", e.waId).in("estado", anteriores);
  }
}

/**
 * Marca los mensajes que su autor borró «para todos» en WhatsApp. **No se borra nada**: el texto original se queda y el chat lo muestra con la marca
 * «eliminado en WhatsApp» (migración 0171). Un aviso repetido no cambia la hora de la primera marca.
 */
export async function guardarRevocados(revocados: RevocadoEntrante[]): Promise<void> {
  if (!revocados.length) return;
  const supabase = createServiceClient();
  for (const r of revocados) {
    const { error } = await supabase.from("whatsapp_mensajes").update({ eliminado_en_whatsapp_en: r.momento }).eq("wa_id", r.waIdOriginal).is("eliminado_en_whatsapp_en", null);
    if (error) console.error("WhatsApp: no se pudo marcar un mensaje eliminado en WhatsApp", r.waIdOriginal, error.message);
  }
}
