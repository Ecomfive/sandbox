import { normalizarTelefono } from "@/lib/crm/telefono";
import { createServiceClient } from "@/lib/supabase/server";
import { ORDEN_ESTADO, resumenMensaje, type EstadoEntrante, type MensajeEntrante } from "./extraer";

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
  const { data } = await supabase.from("dropshippers").select("id, contacto_telefono").in("contacto_telefono", telefonos);
  const dropshipperDe = new Map((data ?? []).map((d) => [d.contacto_telefono as string, d.id as string]));
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
