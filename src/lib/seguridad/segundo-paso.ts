// Verificación en dos pasos (pedido de Jhokser, 27 oct 2026): la lógica pura, sin base ni red, para poder probarla (segundo-paso.test.ts).
// Después de la contraseña se pide un segundo paso: el código de una app autenticadora (TOTP, que maneja Supabase Auth: su sesión sube al
// nivel «aal2») o un código de 6 dígitos que llega por correo. Cuando el segundo paso es el del correo, el sistema deja una marca firmada
// (cookie httpOnly) atada a **esa** sesión de Supabase: una sesión nueva (otro ingreso) vuelve a pedir el código.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** Cuánto vive un código por correo. */
export const CODIGO_VIDA_MIN = 10;
/** Intentos fallidos antes de quemar el código. */
export const MAX_INTENTOS = 5;
/** Códigos por correo que se pueden pedir en una hora. */
export const MAX_ENVIOS_HORA = 5;
/** Espera entre un código y el siguiente. */
export const ESPERA_REENVIO_SEG = 60;
/** Cuánto dura la marca de «segundo paso cumplido»: lo que dura una sesión larga; atada a la sesión, un ingreso nuevo la deja sin efecto. */
export const VIDA_MARCA_DIAS = 30;

/**
 * ¿Está encendida la verificación en dos pasos? Pide `SEGUNDO_PASO=activo` y un `SEGUNDO_PASO_SECRETO` de al menos 32 caracteres. Es el
 * interruptor de emergencia: si el correo falla o alguien queda fuera, se pone `SEGUNDO_PASO=desactivado` en Vercel y se vuelve a
 * desplegar. Sin las dos variables, nada cambia en el ingreso.
 */
export function segundoPasoActivo(env: Record<string, string | undefined> = process.env): boolean {
  return env.SEGUNDO_PASO === "activo" && (env.SEGUNDO_PASO_SECRETO ?? "").length >= 32;
}

/** Un código de 6 dígitos al azar (con ceros a la izquierda), con el generador seguro del sistema. */
export function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Lo que el usuario escribió, como código de 6 dígitos («123 456», «123-456») o null si no lo es. */
export function normalizarCodigo(texto: unknown): string | null {
  const limpio = String(texto ?? "").replace(/[\s-]/g, "");
  return /^\d{6}$/.test(limpio) ? limpio : null;
}

const hmac = (secreto: string, texto: string) => createHmac("sha256", secreto).update(texto, "utf8").digest("hex");

/** La huella con que se guarda un código: atada a la persona, para que el de una no sirva para otra. */
export function huellaCodigo(usuarioId: string, codigo: string, secreto: string): string {
  return hmac(secreto, `codigo:${usuarioId}:${codigo}`);
}

const iguales = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

/** ¿El código escrito es el guardado? Comparación en tiempo constante. */
export function codigoCoincide(huellaGuardada: string, usuarioId: string, codigo: string, secreto: string): boolean {
  return iguales(huellaGuardada, huellaCodigo(usuarioId, codigo, secreto));
}

/** La marca de «segundo paso cumplido»: `vence.firma`, atada a la persona y a su sesión de Supabase. */
export function firmarMarca(usuarioId: string, sesionId: string, vence: number, secreto: string): string {
  return `${vence}.${hmac(secreto, `marca:${usuarioId}:${sesionId}:${vence}`)}`;
}

/** ¿La marca es de esta persona y esta sesión, está bien firmada y no venció? */
export function marcaValida(valor: string | undefined | null, usuarioId: string, sesionId: string | null, ahora: number, secreto: string): boolean {
  if (!valor || !sesionId) return false;
  const [vence, firma, ...resto] = valor.split(".");
  if (!vence || !firma || resto.length || !/^\d{10,16}$/.test(vence)) return false;
  if (Number(vence) <= ahora) return false;
  return iguales(firma, hmac(secreto, `marca:${usuarioId}:${sesionId}:${vence}`));
}

/** El contenido de un JWT (sin verificarlo: solo se usa con un token que Supabase ya validó con `getUser`). */
function cuerpoDeToken(token: string | undefined | null): Record<string, unknown> | null {
  const partes = String(token ?? "").split(".");
  if (partes.length !== 3) return null;
  try {
    const j = JSON.parse(Buffer.from(partes[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** La sesión de Supabase de un token de acceso y su nivel de verificación (`aal2` = ya puso el código de su app autenticadora). */
export function sesionDeToken(token: string | undefined | null): { sesionId: string | null; aal: string | null } {
  const c = cuerpoDeToken(token);
  return { sesionId: typeof c?.session_id === "string" ? c.session_id : null, aal: typeof c?.aal === "string" ? c.aal : null };
}

/** «hernan@gmail.com» → «he••••@gmail.com»: para decir a dónde se mandó el código sin regalar el correo completo. */
export function enmascararCorreo(correo: string): string {
  const [local, dominio] = String(correo ?? "").split("@");
  if (!local || !dominio) return "tu correo";
  return `${local.slice(0, Math.min(2, Math.max(1, local.length - 1)))}••••@${dominio}`;
}

/** Segundos que faltan para poder pedir otro código (0 si ya se puede). */
export function segundosParaReenviar(ultimoEnvio: string | null, ahora: number): number {
  if (!ultimoEnvio) return 0;
  return Math.max(0, Math.ceil((Date.parse(ultimoEnvio) + ESPERA_REENVIO_SEG * 1000 - ahora) / 1000));
}

/** El correo con el código (solo dígitos y texto fijo: nada escrito por una persona). */
export function correoDelCodigo(codigo: string): { asunto: string; html: string } {
  return {
    asunto: `Tu código de verificación: ${codigo}`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#202020">` +
      `<p style="margin:0 0 12px">Tu código para entrar a Ecomfive Business OS es:</p>` +
      `<p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:6px">${codigo}</p>` +
      `<p style="margin:0 0 8px;font-size:13px;color:#555">Vence en ${CODIGO_VIDA_MIN} minutos. Si no fuiste tú quien intentó entrar, ignora este correo y cambia tu contraseña.</p>` +
      `<p style="margin:0;font-size:13px;color:#555">Nadie del equipo te lo va a pedir por mensaje.</p>` +
      `</div>`,
  };
}
