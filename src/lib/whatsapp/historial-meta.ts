import { createServiceClient } from "@/lib/supabase/server";

/**
 * El historial de los chats del celular (coexistencia, 29 oct 2026). Al conectar un número que sigue en la app WhatsApp Business, Meta puede
 * mandar **una sola vez** (y solo si se pide dentro de las 24 h) los mensajes de los últimos 180 días (campo `history`) y los contactos
 * (`smb_app_state_sync`). Como no se puede volver a pedir, cada aviso se guarda **tal cual llega**, antes de nada, en el almacén
 * `whatsapp-importados/historial-meta/`; después se pasa a los chats de la bandeja con calma.
 */
const BUCKET = "whatsapp-importados";
const CAMPOS_HISTORIAL = new Set(["history", "smb_app_state_sync"]);

export const traeHistorial = (campos: string[]): boolean => campos.some((c) => CAMPOS_HISTORIAL.has(c));

/** Guarda el aviso crudo. Si el almacén no existe, lo crea. Devuelve la ruta, o null si no se pudo (queda en los registros). */
export async function guardarAvisoCrudo(crudo: string, campos: string[]): Promise<string | null> {
  const supabase = createServiceClient();
  const ruta = `historial-meta/${new Date().toISOString().replace(/[:.]/g, "-")}-${campos.filter((c) => CAMPOS_HISTORIAL.has(c)).join("+")}-${crypto.randomUUID()}.json`;
  const subir = () => supabase.storage.from(BUCKET).upload(ruta, new Blob([crudo], { type: "application/json" }), { contentType: "application/json", upsert: false });
  let r = await subir();
  if (r.error) {
    await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 25 * 1024 * 1024 }).catch(() => null);
    r = await subir();
  }
  if (r.error) {
    console.error(`[whatsapp] NO se pudo guardar el historial de Meta (${crudo.length} bytes): ${r.error.message}`);
    return null;
  }
  console.log(`[whatsapp] historial de Meta guardado: ${ruta} (${crudo.length} bytes)`);
  return ruta;
}
