// QuickBooks Online (API v3 de Intuit, OAuth 2.0). Lógica pura: la configuración (variables de servidor), la dirección de
// autorización, el `state` firmado contra CSRF (HMAC con la clave `QBO_TOKEN_KEY`, con vencimiento, atado a la persona y a
// un número de una sola vez que también va en una cookie httpOnly), la lectura de la respuesta de tokens y cuándo hay que
// renovar el access token. La conexión vive en `cliente.ts`. Prueba en `oauth.test.ts`.

import { randomBytes } from "node:crypto";
import { claveDesdeTexto, firmarHmac, firmasIguales } from "../seguridad/cifrado-tokens";

export type EntornoQbo = "sandbox" | "production";

export interface ConfigQbo {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  entorno: EntornoQbo;
  clave: Buffer;
}

export const URL_AUTORIZACION = "https://appcenter.intuit.com/connect/oauth2";
export const URL_TOKENS = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const URL_REVOCAR = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
export const ALCANCE = "com.intuit.quickbooks.accounting";
export const COOKIE_STATE = "qbo_oauth_nonce";
/** Minutos que vale un `state` (el tiempo de pasar por la pantalla de Intuit). */
export const MINUTOS_STATE = 10;

export const baseApi = (entorno: EntornoQbo) => (entorno === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com");

/** Las variables que faltan para conectar (vacío = todo listo). Nunca devuelve valores. */
export function variablesQboFaltantes(env: Record<string, string | undefined>): string[] {
  const faltan: string[] = [];
  for (const n of ["QBO_CLIENT_ID", "QBO_CLIENT_SECRET", "QBO_REDIRECT_URI", "QBO_TOKEN_KEY"]) if (!env[n]?.trim()) faltan.push(n);
  if (env.QBO_TOKEN_KEY?.trim() && !claveDesdeTexto(env.QBO_TOKEN_KEY)) faltan.push("QBO_TOKEN_KEY (mínimo 32 caracteres)");
  if (env.QBO_REDIRECT_URI?.trim() && !/^https:\/\/[^\s]+$|^http:\/\/localhost(:\d+)?\//.test(env.QBO_REDIRECT_URI.trim())) faltan.push("QBO_REDIRECT_URI (https)");
  return faltan;
}

/** La configuración completa, o null si falta algo. `QBO_ENTORNO` = sandbox (por defecto) o production. */
export function leerConfigQbo(env: Record<string, string | undefined>): ConfigQbo | null {
  if (variablesQboFaltantes(env).length) return null;
  return {
    clientId: env.QBO_CLIENT_ID!.trim(),
    clientSecret: env.QBO_CLIENT_SECRET!.trim(),
    redirectUri: env.QBO_REDIRECT_URI!.trim(),
    entorno: env.QBO_ENTORNO?.trim() === "production" ? "production" : "sandbox",
    clave: claveDesdeTexto(env.QBO_TOKEN_KEY)!,
  };
}

export const nuevoNonce = () => randomBytes(16).toString("base64url");

/** El `state`: `<datos base64url>.<firma>`; los datos llevan la persona, el número de una vez y el vencimiento. */
export function firmarState(datos: { usuarioId: string; nonce: string; vence: number }, clave: Buffer): string {
  const cuerpo = Buffer.from(JSON.stringify({ u: datos.usuarioId, n: datos.nonce, v: datos.vence })).toString("base64url");
  return `${cuerpo}.${firmarHmac(cuerpo, clave, "qbo-state")}`;
}

/** Verifica el `state` del retorno: firma, vencimiento, misma persona y mismo número que la cookie. */
export function verificarState(
  state: string | null,
  esperado: { usuarioId: string; nonceCookie: string | null | undefined; ahora: number },
  clave: Buffer,
): { ok: true } | { ok: false; motivo: string } {
  if (!state || state.length > 600) return { ok: false, motivo: "Falta el state." };
  const [cuerpo, firma, ...resto] = state.split(".");
  if (!cuerpo || !firma || resto.length) return { ok: false, motivo: "State mal formado." };
  if (!firmasIguales(firma, firmarHmac(cuerpo, clave, "qbo-state"))) return { ok: false, motivo: "La firma del state no coincide." };
  let d: { u?: unknown; n?: unknown; v?: unknown };
  try {
    d = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
  } catch {
    return { ok: false, motivo: "State mal formado." };
  }
  if (typeof d.v !== "number" || d.v < esperado.ahora) return { ok: false, motivo: "La autorización tardó demasiado: vuelve a pulsar «Conectar QuickBooks»." };
  if (d.u !== esperado.usuarioId) return { ok: false, motivo: "La autorización la empezó otra persona." };
  if (typeof d.n !== "string" || !esperado.nonceCookie || !firmasIguales(d.n, esperado.nonceCookie)) return { ok: false, motivo: "La autorización no se empezó en este navegador." };
  return { ok: true };
}

/** La dirección de la pantalla de autorización de Intuit. */
export function urlAutorizacion(cfg: Pick<ConfigQbo, "clientId" | "redirectUri">, state: string): string {
  const p = new URLSearchParams({ client_id: cfg.clientId, response_type: "code", scope: ALCANCE, redirect_uri: cfg.redirectUri, state });
  return `${URL_AUTORIZACION}?${p.toString()}`;
}

export const cabeceraBasica = (cfg: Pick<ConfigQbo, "clientId" | "clientSecret">) => `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  accessExpira: string;
  refreshExpira: string | null;
}

/** La respuesta del punto de tokens (código o renovación) como fechas de vencimiento; null si no trae lo necesario. */
export function leerRespuestaTokens(v: unknown, ahora: number): Tokens | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const access = typeof o.access_token === "string" ? o.access_token : "";
  const refresh = typeof o.refresh_token === "string" ? o.refresh_token : "";
  const exp = Number(o.expires_in);
  if (!access || !refresh || !Number.isFinite(exp) || exp <= 0) return null;
  const expR = Number(o.x_refresh_token_expires_in);
  return {
    accessToken: access,
    refreshToken: refresh,
    accessExpira: new Date(ahora + exp * 1000).toISOString(),
    refreshExpira: Number.isFinite(expR) && expR > 0 ? new Date(ahora + expR * 1000).toISOString() : null,
  };
}

/** ¿Hay que renovar el access token? (le quedan menos de 5 minutos). */
export function necesitaRenovar(accessExpira: string, ahora: number): boolean {
  const t = Date.parse(accessExpira);
  return Number.isNaN(t) || t - ahora < 5 * 60_000;
}

/** El realmId del retorno (solo dígitos). */
export const leerRealmId = (v: string | null): string | null => (v && /^[0-9]{1,30}$/.test(v) ? v : null);
