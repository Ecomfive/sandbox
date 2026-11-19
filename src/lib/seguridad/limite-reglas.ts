// Límite de peticiones: lo puro (seguridad · 19 nov 2026). Cuántas veces se puede hacer algo en una ventana de tiempo, de qué IP viene
// la petición y cómo se arma la clave que se cuenta. La parte que habla con la base está en `limite.ts` (migración 0330). Prueba en
// `limite-reglas.test.ts`.

import { createHash } from "node:crypto";

export interface ReglaLimite {
  /** Largo de la ventana, en segundos (máximo un día). */
  ventana: number;
  /** Cuántas veces se puede dentro de la ventana. */
  maximo: number;
}

/**
 * Los límites del sistema, en un solo lugar.
 *  - Login, cada 15 minutos: 5 intentos por correo desde una misma IP (lo que frena a quien prueba claves), 30 por IP (una oficina
 *    comparte IP) y 50 por correo desde cualquier IP. Por correo solo el tope es alto a propósito: si fuera 5, cualquiera que supiera el
 *    correo de un administrador lo dejaría afuera para siempre desde otra IP; a los 10 fallos se avisa. Se suma antes de probar la clave
 *    (sin carreras) y se devuelve si la clave era correcta o si Supabase no respondió: solo quedan los fallidos.
 *  - Asistente con IA: 30 preguntas por hora y 150 por día por persona (un uso normal no llega; cada pregunta cuesta).
 *  - Enlace del mensajero: 60 acciones cada 10 minutos por enlace e IP (marcar entregada o fallida y subir fotos).
 *  - Avisos de seguridad: uno por asunto por hora y 20 en total por hora (no llenar la campana si alguien insiste).
 */
export const LIMITES = {
  loginCorreoIp: { ventana: 15 * 60, maximo: 5 },
  loginIp: { ventana: 15 * 60, maximo: 30 },
  loginCorreo: { ventana: 15 * 60, maximo: 50 },
  /** Solo avisa (no frena): fallos para un correo, sumando todas las IP. */
  loginCorreoAviso: { ventana: 15 * 60, maximo: 10 },
  asistenteHora: { ventana: 60 * 60, maximo: 30 },
  asistenteDia: { ventana: 24 * 60 * 60, maximo: 150 },
  mensajero: { ventana: 10 * 60, maximo: 60 },
  avisoSeguridad: { ventana: 60 * 60, maximo: 1 },
  avisoSeguridadTotal: { ventana: 60 * 60, maximo: 20 },
  // Código de la verificación en dos pasos: 6 intentos cada 15 minutos por persona (son 6 números: sin tope se podrían probar todos).
  dosPasos: { ventana: 15 * 60, maximo: 6 },
} as const satisfies Record<string, ReglaLimite>;

/** Lo que ve quien llegó al límite del login: no dice si el correo existe. */
export const DEMASIADOS_INTENTOS = "Demasiados intentos. Espera unos minutos y vuelve a probar.";
/** Lo que ve el mensajero si su enlace hace demasiadas cosas seguidas. */
export const DEMASIADAS_ACCIONES = "Demasiadas acciones seguidas. Espera unos minutos y vuelve a probar.";

const FORMA_IP = /^[0-9a-f.:]{2,45}$/i;

/** Una IP con forma de IP (v4 o v6), sin espacios; si no, null. */
function ipValida(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim().toLowerCase();
  return FORMA_IP.test(v) ? v : null;
}

/**
 * La IP de quien pide, de las cabeceras de Vercel: `x-real-ip` y, si no está, la primera de `x-forwarded-for` (la del cliente; las que
 * siguen son de los proxies). Sin ninguna válida, null: el límite por IP no se aplica (mejor eso que juntar a todos en una sola cuenta).
 */
export function ipDeCabeceras(leer: (nombre: string) => string | null | undefined): string | null {
  return ipValida(leer("x-real-ip")) ?? ipValida((leer("x-forwarded-for") ?? "").split(",")[0]);
}

/** El correo como se compara: sin espacios y en minúsculas. Lo que no es texto queda vacío. */
export const normalizarCorreo = (correo: unknown): string => (typeof correo === "string" ? correo.trim().toLowerCase() : "");

const FORMA_CORREO = /^[^\s@<>"'`()[\]\\,;:]{1,64}@[a-z0-9.-]{1,180}\.[a-z]{2,24}$/i;

/**
 * ¿Lo escrito tiene forma de correo? Solo entonces se cuenta por correo y se nombra en un aviso: lo que escribe quien ataca no entra a la
 * campana tal cual (sin espacios, comillas ni signos de HTML, y de hasta 254 caracteres).
 */
export const pareceCorreo = (correo: string): boolean => correo.length <= 254 && FORMA_CORREO.test(correo);

/** Lo que se sumó al probar una clave (este intento incluido; null = no se cuenta o la base falló). */
export interface CuentasIngreso {
  correoIp: number | null;
  ip: number | null;
  correo: number | null;
}

/** ¿Alguna cuenta pasó su tope con este intento? Entonces ni se prueba la clave. */
export function frenaIngreso(c: CuentasIngreso): boolean {
  const pasa = (n: number | null, r: ReglaLimite) => n !== null && n > r.maximo;
  return pasa(c.correoIp, LIMITES.loginCorreoIp) || pasa(c.ip, LIMITES.loginIp) || pasa(c.correo, LIMITES.loginCorreo);
}

/**
 * La clave que se cuenta en la base: el tipo, legible, y lo demás resumido (sha-256, 32 caracteres), para que la tabla no guarde correos,
 * IP ni códigos de enlace. Mismas partes, misma clave.
 */
export function claveLimite(tipo: string, ...partes: string[]): string {
  const resumen = createHash("sha256").update(partes.join("\n")).digest("hex").slice(0, 32);
  return `${tipo.replace(/[^a-z0-9-]/gi, "").slice(0, 60) || "limite"}:${resumen}`;
}

/** Inicio de la ventana fija en que cae `ahora` (milisegundos): el múltiplo de su largo, igual que `limite_sumar` en la base. */
export function inicioDeVentana(ahoraMs: number, ventanaSegundos: number): number {
  const largo = ventanaSegundos * 1000;
  return Math.floor(ahoraMs / largo) * largo;
}

/** Cuántos minutos faltan (al menos 1) para que empiece la próxima ventana y el contador vuelva a cero. */
export function minutosParaReabrir(ahoraMs: number, ventanaSegundos: number): number {
  const fin = inicioDeVentana(ahoraMs, ventanaSegundos) + ventanaSegundos * 1000;
  return Math.max(1, Math.ceil((fin - ahoraMs) / 60_000));
}

/** «en 12 minutos», «en 1 minuto», «en 3 horas» (de 90 minutos para arriba, en horas redondeadas hacia arriba). */
export function textoEspera(minutos: number): string {
  if (minutos >= 90) {
    const horas = Math.ceil(minutos / 60);
    return `en ${horas} horas`;
  }
  return minutos === 1 ? "en 1 minuto" : `en ${minutos} minutos`;
}

/** Después de sumar un fallo, ¿se llegó al máximo? (es cuando se avisa). */
export const llegoAlMaximo = (cuentaTrasSumar: number | null, regla: ReglaLimite): boolean => cuentaTrasSumar !== null && cuentaTrasSumar >= regla.maximo;

/**
 * ¿El error de Supabase al entrar es por correo o clave equivocados? Solo esos cuentan para el límite: una caída de Supabase, su propio
 * límite (429) o un correo sin confirmar no son una clave mal puesta.
 */
export function esClaveEquivocada(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; status?: unknown; message?: unknown };
  if (e.code === "invalid_credentials" || e.code === "invalid_grant") return true;
  if (typeof e.message === "string" && /invalid login credentials/i.test(e.message)) return true;
  return e.code === undefined && e.status === 400;
}

/** Lo que ve quien llegó al tope del asistente. */
export function textoTopeAsistente(regla: ReglaLimite, porDia: boolean, ahoraMs: number): string {
  const cuando = textoEspera(minutosParaReabrir(ahoraMs, regla.ventana));
  return `Llegaste al máximo de ${regla.maximo} preguntas ${porDia ? "por día" : "por hora"}. Vuelve a probar ${cuando}.`;
}
