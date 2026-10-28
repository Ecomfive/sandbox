import { config360, urlMensajes360 } from "./proveedor";
import { errorEnEspanol } from "./ventana";

type Resultado = { waId: string } | { error: string };

/**
 * Manda un mensaje desde un número de la empresa (`phoneNumberId`) a un dropshipper. Con 360dialog configurado (`D360_API_KEY`, ver
 * `proveedor.ts`) sale por 360dialog; si no, por la Cloud API de Meta con `WHATSAPP_TOKEN` (de un usuario del sistema de Meta,
 * permanente). Las claves solo viven en el servidor. Devuelve el id del mensaje en WhatsApp para enlazar después sus estados
 * (entregado, leído), o el error en palabras para el equipo.
 */
async function enviar(phoneNumberId: string, para: string, contenido: Record<string, unknown>): Promise<Resultado> {
  // Un teléfono va en `to` (solo dígitos); un id de usuario de WhatsApp sin teléfono (BSUID, el sandbox lo usa a veces) en `recipient`.
  const destino = /^\+?\d+$/.test(para) ? { to: para.replace(/\D/g, "") } : { recipient: para };
  const mensaje = JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...destino, ...contenido });
  const d360 = config360();
  let url: string;
  let cabeceras: Record<string, string>;
  if (d360) {
    url = urlMensajes360(d360);
    cabeceras = { "D360-API-KEY": d360.clave, "Content-Type": "application/json" };
  } else {
    const token = process.env.WHATSAPP_TOKEN;
    if (!token) return { error: "WhatsApp todavía no está conectado: falta la clave de 360dialog (D360_API_KEY) o el token de Meta (WHATSAPP_TOKEN)." };
    const version = process.env.WHATSAPP_API_VERSION || "v23.0";
    if (!/^\d+$/.test(phoneNumberId) || !/^v\d+\.\d+$/.test(version)) return { error: "El número de WhatsApp no es válido." };
    url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    cabeceras = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }
  let r: Response;
  try {
    r = await fetch(url, { method: "POST", headers: cabeceras, body: mensaje, signal: AbortSignal.timeout(20_000) });
  } catch {
    return { error: "No se pudo conectar con WhatsApp. Inténtalo de nuevo." };
  }
  const j = (await r.json().catch(() => null)) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } } | null;
  const waId = j?.messages?.[0]?.id;
  if (r.ok && waId) return { waId };
  if (d360 && r.status === 429) return { error: "360dialog no deja mandar más mensajes por ahora (en el sandbox, el límite es de 200)." };
  if (d360 && r.status === 401) return { error: "360dialog rechazó la clave (D360_API_KEY). Revísala en el servidor." };
  return { error: errorEnEspanol(j?.error?.code ?? null, j?.error?.message ?? null) };
}

/** Un texto. */
export function enviarTextoWhatsapp(phoneNumberId: string, para: string, cuerpo: string): Promise<Resultado> {
  return enviar(phoneNumberId, para, { type: "text", text: { preview_url: false, body: cuerpo } });
}

/**
 * Una foto, un video o un documento. WhatsApp lo baja de `enlace` (un enlace firmado del bucket, de una hora) al mandarlo. El pie
 * (`texto`) va debajo; un documento lleva además su nombre.
 */
export function enviarArchivoWhatsapp(
  phoneNumberId: string,
  para: string,
  archivo: { tipoWa: "image" | "video" | "document"; enlace: string; texto: string | null; nombre: string | null },
): Promise<Resultado> {
  const cuerpo: Record<string, string> = { link: archivo.enlace };
  if (archivo.texto) cuerpo.caption = archivo.texto;
  if (archivo.tipoWa === "document" && archivo.nombre) cuerpo.filename = archivo.nombre;
  return enviar(phoneNumberId, para, { type: archivo.tipoWa, [archivo.tipoWa]: cuerpo });
}
