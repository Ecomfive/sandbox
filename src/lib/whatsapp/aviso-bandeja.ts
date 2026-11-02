import { after } from "next/server";
import { CANAL_BANDEJA, EVENTO_NOVEDAD } from "./canal-bandeja";

async function mandarAviso(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return;
  try {
    const r = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: CANAL_BANDEJA, event: EVENTO_NOVEDAD, payload: {} }] }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) console.error("WhatsApp: no se pudo avisar a las bandejas abiertas", r.status);
  } catch (e) {
    // Sin aviso, las bandejas lo ven en su siguiente vuelta de refresco: nada se pierde.
    console.error("WhatsApp: no se pudo avisar a las bandejas abiertas", e instanceof Error ? e.message : e);
  }
}

/**
 * Avisa a las bandejas abiertas que hay algo nuevo (canal-bandeja.ts). Va después de responder (`after`), así no demora el envío ni el
 * webhook; fuera de una petición, se manda en el momento.
 */
export async function avisarBandeja(): Promise<void> {
  try {
    after(mandarAviso);
  } catch {
    await mandarAviso();
  }
}
