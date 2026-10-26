import { errorEnEspanol } from "./ventana";

/**
 * El envío por WhatsApp Cloud API (Graph API de Meta): un texto desde un número de la empresa (`phoneNumberId`) a un dropshipper. El
 * token (`WHATSAPP_TOKEN`, de un usuario del sistema de Meta, permanente) solo vive en el servidor. Devuelve el id del mensaje en
 * WhatsApp para enlazar después sus estados (entregado, leído), o el error en palabras para el equipo.
 */
export async function enviarTextoWhatsapp(phoneNumberId: string, para: string, cuerpo: string): Promise<{ waId: string } | { error: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { error: "WhatsApp todavía no está conectado: falta el token de Meta (WHATSAPP_TOKEN)." };
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  if (!/^\d+$/.test(phoneNumberId) || !/^v\d+\.\d+$/.test(version)) return { error: "El número de WhatsApp no es válido." };
  let r: Response;
  try {
    r = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: para.replace(/\D/g, ""), type: "text", text: { preview_url: false, body: cuerpo } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { error: "No se pudo conectar con WhatsApp. Inténtalo de nuevo." };
  }
  const j = (await r.json().catch(() => null)) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } } | null;
  const waId = j?.messages?.[0]?.id;
  if (r.ok && waId) return { waId };
  return { error: errorEnEspanol(j?.error?.code ?? null, j?.error?.message ?? null) };
}
