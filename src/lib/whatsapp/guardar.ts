import { normalizarTelefono } from "@/lib/crm/telefono";
import { createServiceClient } from "@/lib/supabase/server";
import { BUCKET_WHATSAPP, extensionDeMime } from "./archivos";
import { ORDEN_ESTADO, resumenMensaje, type EstadoEntrante, type MensajeEntrante } from "./extraer";
import { bajarArchivoWhatsapp } from "./media";

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
    else if (m.mediaId) await copiarAlBucket(m.waId, m.mediaId, m.mediaMime);
  }
}

/** Los tipos que se guardan con su tipo real (se muestran en la bandeja); cualquier otro queda como archivo para descargar. */
const SE_MUESTRAN = /^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp)|application\/pdf)$/;

/**
 * Copia al bucket del sistema (migración 0169, `entrantes/`) un archivo que llegó por WhatsApp, porque Meta solo lo guarda unos 30
 * días. Si no se puede (el sandbox no entrega archivos, o Meta falla), el mensaje queda como antes: se baja de Meta al abrirlo.
 */
async function copiarAlBucket(waId: string, mediaId: string, mime: string | null): Promise<void> {
  const r = await bajarArchivoWhatsapp(mediaId);
  if ("error" in r) return;
  const tipo = String(r.mime || mime || "").split(";")[0].trim().toLowerCase();
  const ruta = `entrantes/${waId.replace(/[^\w.-]+/g, "_").slice(0, 160)}.${extensionDeMime(tipo)}`;
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(BUCKET_WHATSAPP).upload(ruta, r.bytes, { contentType: SE_MUESTRAN.test(tipo) ? tipo : "application/octet-stream", upsert: true });
  if (error) {
    console.error("WhatsApp: no se pudo copiar un archivo al bucket", waId, error.message);
    return;
  }
  await supabase.from("whatsapp_mensajes").update({ media_ruta: ruta }).eq("wa_id", waId).is("media_ruta", null);
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
