import { config360, urlMensajes360, variableClave360 } from "./proveedor";
import { errorEnEspanol, leerErrorEnvio } from "./ventana";

/** El número de la empresa por donde sale: su id en Meta y el número («+584220350576»), que elige la clave de 360dialog. */
export interface NumeroEmpresa {
  phoneNumberId: string;
  numero: string | null;
}

/**
 * El envío de un texto desde un número de la empresa a un dropshipper. Con 360dialog configurado (`D360_API_KEY`, o la propia del
 * número, ver `proveedor.ts`) sale por 360dialog; si no, por la Cloud API de Meta con `WHATSAPP_TOKEN` (de un usuario del sistema de Meta,
 * permanente). Las claves solo viven en el servidor. Devuelve el id del mensaje en WhatsApp para enlazar después sus estados (entregado,
 * leído), o el error en palabras para el equipo.
 */
export async function enviarTextoWhatsapp(de: NumeroEmpresa, para: string, cuerpo: string): Promise<{ waId: string } | { error: string }> {
  return enviarMensajeWhatsapp(de, para, { type: "text", text: { preview_url: false, body: cuerpo } });
}

/**
 * Manda una plantilla aprobada (la única forma de escribirle a alguien pasadas 24 h de su último mensaje). `parametros` son los valores de
 * {{1}}, {{2}}… en orden, ya limpios (sin saltos de línea). `idioma` es el código de la plantilla («es»).
 */
export async function enviarPlantillaWhatsapp(de: NumeroEmpresa, para: string, nombre: string, idioma: string, parametros: string[]): Promise<{ waId: string } | { error: string }> {
  const componentes = parametros.length ? [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }] : [];
  return enviarMensajeWhatsapp(de, para, { type: "template", template: { name: nombre, language: { code: idioma }, components: componentes } });
}

async function enviarMensajeWhatsapp({ phoneNumberId, numero }: NumeroEmpresa, para: string, contenido: Record<string, unknown>): Promise<{ waId: string } | { error: string }> {
  // Un teléfono va en `to` (solo dígitos); un id de usuario de WhatsApp sin teléfono (BSUID, el sandbox lo usa a veces) en `recipient`.
  const destino = /^\+?\d+$/.test(para) ? { to: para.replace(/\D/g, "") } : { recipient: para };
  const mensaje = JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...destino, ...contenido });
  const d360 = config360(numero);
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
    r = await fetch(url, { method: "POST", headers: cabeceras, body: mensaje, signal: AbortSignal.timeout(15_000) });
  } catch {
    return { error: "No se pudo conectar con WhatsApp. Inténtalo de nuevo." };
  }
  const crudo = await r.text().catch(() => "");
  let j: unknown = crudo;
  try {
    j = JSON.parse(crudo);
  } catch {
    // Sin JSON: el texto tal cual sirve de motivo.
  }
  const waId = (j as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
  if (r.ok && waId) return { waId };
  // En los registros de Vercel queda la respuesta tal cual (no lleva claves: solo el motivo de WhatsApp o de 360dialog).
  console.error(`[whatsapp] envío rechazado por ${d360 ? "360dialog" : "Meta"} (${r.status}): ${crudo.slice(0, 800)}`);
  if (d360 && r.status === 429) return { error: "360dialog no deja mandar más mensajes por ahora (en el sandbox, el límite es de 200)." };
  if (d360 && r.status === 401) {
    const propia = numero ? variableClave360(numero) : null;
    return { error: `360dialog rechazó la clave de este número. Revisa en el servidor ${propia ? `${propia} (o D360_API_KEY si no tiene la suya)` : "D360_API_KEY"}.` };
  }
  const motivo = leerErrorEnvio(r.status, j);
  return { error: errorEnEspanol(motivo.codigo, motivo.mensaje) };
}
