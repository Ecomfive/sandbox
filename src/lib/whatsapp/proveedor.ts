// WhatsApp por 360dialog (28 oct 2026): un socio oficial de Meta que conecta los números de la empresa por QR (también con
// coexistencia, sin la revisión de proveedor tecnológico) y expone la misma API que la Cloud API de Meta. Con `D360_API_KEY` en el
// servidor, todo el envío y los archivos van por 360dialog; sin ella, directo con Meta (`WHATSAPP_TOKEN`). Una clave de 360dialog es de
// un solo número: es la opción «un solo número para todo el equipo» (el área es de cada conversación, migración 0168).
//   D360_API_KEY       la clave del número (o la de prueba del sandbox).
//   D360_SANDBOX       «1» mientras se prueba con el sandbox (otro dominio; no entrega archivos; solo se le escribe al propio teléfono).
//   D360_WEBHOOK_CLAVE una palabra larga inventada: va en la dirección del webhook, porque 360dialog no firma los avisos.

export interface Config360 {
  clave: string;
  sandbox: boolean;
}

/** El número de la empresa cuando el aviso de 360dialog no lo trae (el sandbox no manda `metadata`). */
export const NUMERO_360_SIN_ID = "360dialog";

const ORIGEN = "https://waba-v2.360dialog.io";
const ORIGEN_SANDBOX = "https://waba-sandbox.360dialog.io";

export function config360(): Config360 | null {
  const clave = process.env.D360_API_KEY?.trim();
  return clave ? { clave, sandbox: process.env.D360_SANDBOX === "1" } : null;
}

/** Donde se mandan los mensajes. */
export const urlMensajes360 = (c: Config360) => (c.sandbox ? `${ORIGEN_SANDBOX}/v1/messages` : `${ORIGEN}/messages`);

/** Donde se registra la dirección del webhook. */
export const urlWebhook360 = (c: Config360) => `${c.sandbox ? ORIGEN_SANDBOX : ORIGEN}/v1/configs/webhook`;

/** Los datos de un archivo (devuelve una dirección temporal de Meta que se baja por 360dialog). */
export const urlMedia360 = (mediaId: string) => `${ORIGEN}/${encodeURIComponent(mediaId)}`;

/**
 * La descarga del archivo: 360dialog pide cambiar el dominio de Meta (`lookaside.fbsbx.com`) por el suyo y mandar la clave. Solo se
 * acepta una dirección de Meta; cualquier otra da null.
 */
export function urlDescarga360(urlMeta: string): string | null {
  let u: URL;
  try {
    u = new URL(urlMeta);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !/(^|\.)fbsbx\.com$/i.test(u.hostname)) return null;
  return `${ORIGEN}${u.pathname}${u.search}`;
}
