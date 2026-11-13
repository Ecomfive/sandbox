// iComfly (13 nov 2026): las piezas sin red de la conexión con su «Conector Claude» (un servidor MCP con OAuth 2.1: registro dinámico, PKCE S256, código y
// renovación; lo dice https://api.icomfly.com/.well-known/oauth-authorization-server). El sistema es un cliente más, como Claude.ai. Con prueba
// (`icomfly-oauth.test.ts`). La parte con red está en `icomfly.ts`.

import { createHash, randomBytes } from "node:crypto";
import { claveDesdeTexto, firmarHmac, firmasIguales } from "@/lib/seguridad/cifrado-tokens";

export const ICOMFLY_API = "https://api.icomfly.com";
export const COOKIE_ICOMFLY = "icomfly_oauth_nonce";
export const MINUTOS_STATE_ICOMFLY = 15;
/** Lo que pide el conector («mcp read»). */
export const ALCANCE_ICOMFLY = "mcp read";

/** La «URL del servidor MCP» de una tienda en iComfly › Conector Claude, limpia; null si no es una de iComfly. */
export function leerUrlConector(v: unknown): string | null {
  const t = String(v ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/api\.icomfly\.com\/mcp\/[A-Za-z0-9_-]{6,80}$/.test(t) ? t : null;
}

/**
 * La clave con que se cifran los tokens: `ICOMFLY_TOKEN_KEY` si está; si no, una derivada de la clave de servicio de Supabase (ya es un secreto del servidor y
 * quien la tiene ya lee la base), así no hace falta otra variable en Vercel para empezar.
 */
export function claveIcomfly(env: Record<string, string | undefined> = process.env): Buffer | null {
  const propia = claveDesdeTexto(env.ICOMFLY_TOKEN_KEY);
  if (propia) return propia;
  const servicio = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return servicio ? createHash("sha256").update(`icomfly-tokens:${servicio}`, "utf8").digest() : null;
}

/** El verificador PKCE (43 caracteres) y su desafío S256. */
export function nuevoPkce(): { verificador: string; desafio: string } {
  const verificador = randomBytes(32).toString("base64url");
  return { verificador, desafio: desafioPkce(verificador) };
}
export const desafioPkce = (verificador: string) => createHash("sha256").update(verificador, "ascii").digest("base64url");

export const nuevoNonceIcomfly = () => randomBytes(16).toString("base64url");

/** El `state` firmado: tienda, persona, número de una vez y vencimiento. */
export function firmarStateIcomfly(d: { tiendaId: string; usuarioId: string; nonce: string; vence: number }, clave: Buffer): string {
  const cuerpo = Buffer.from(JSON.stringify({ t: d.tiendaId, u: d.usuarioId, n: d.nonce, v: d.vence })).toString("base64url");
  return `${cuerpo}.${firmarHmac(cuerpo, clave, "icomfly-state")}`;
}

/** Verifica el `state` del retorno y devuelve la tienda: firma, vencimiento, misma persona y mismo número que la cookie de este navegador. */
export function verificarStateIcomfly(
  state: string | null,
  esperado: { usuarioId: string; nonceCookie: string | null | undefined; ahora: number },
  clave: Buffer,
): { ok: true; tiendaId: string } | { ok: false; motivo: string } {
  if (!state || state.length > 800) return { ok: false, motivo: "Falta el state." };
  const [cuerpo, firma, ...resto] = state.split(".");
  if (!cuerpo || !firma || resto.length) return { ok: false, motivo: "State mal formado." };
  if (!firmasIguales(firma, firmarHmac(cuerpo, clave, "icomfly-state"))) return { ok: false, motivo: "La firma del state no coincide." };
  let d: { t?: unknown; u?: unknown; n?: unknown; v?: unknown };
  try {
    d = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
  } catch {
    return { ok: false, motivo: "State mal formado." };
  }
  if (typeof d.v !== "number" || d.v < esperado.ahora) return { ok: false, motivo: "La autorización tardó demasiado: vuelve a pulsar «Conectar iComfly»." };
  if (d.u !== esperado.usuarioId) return { ok: false, motivo: "La autorización la empezó otra persona." };
  if (typeof d.n !== "string" || !esperado.nonceCookie || !firmasIguales(d.n, esperado.nonceCookie)) return { ok: false, motivo: "La autorización no se empezó en este navegador." };
  if (typeof d.t !== "string" || !/^[0-9a-f-]{36}$/i.test(d.t)) return { ok: false, motivo: "State sin tienda." };
  return { ok: true, tiendaId: d.t };
}

/** La dirección de autorización de iComfly (donde la persona pega su token y autoriza). */
export function urlAutorizacionIcomfly(p: { clientId: string; redirectUri: string; desafio: string; state: string; recurso: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    code_challenge: p.desafio,
    code_challenge_method: "S256",
    state: p.state,
    scope: ALCANCE_ICOMFLY,
    resource: p.recurso,
  });
  return `${ICOMFLY_API}/authorize?${q.toString()}`;
}

export interface TokensIcomfly {
  access: string;
  refresh: string | null;
  expiraEn: string;
}

/** Los tokens de la respuesta de `/token`; null si no trae `access_token`. Sin `expires_in` se toma una hora. */
export function leerTokensIcomfly(v: unknown, ahora: number): TokensIcomfly | null {
  const r = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  if (!r || typeof r.access_token !== "string" || !r.access_token) return null;
  const segundos = Number(r.expires_in);
  return {
    access: r.access_token,
    refresh: typeof r.refresh_token === "string" && r.refresh_token ? r.refresh_token : null,
    expiraEn: new Date(ahora + (Number.isFinite(segundos) && segundos > 0 ? segundos : 3600) * 1000).toISOString(),
  };
}

/** Renovar con un margen de 2 minutos. */
export const venceProntoIcomfly = (expiraEn: string | null, ahora: number) => !expiraEn || Date.parse(expiraEn) - ahora < 120_000;

/** La respuesta JSON-RPC con ese `id` dentro de una respuesta del servidor MCP: JSON directo o un flujo de eventos (`data: {...}`). */
export function respuestaRpc(texto: string, id: number): { result?: unknown; error?: { code?: number; message?: string } } | null {
  const t = texto.trim();
  if (!t) return null;
  const candidatos: unknown[] = [];
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const j = JSON.parse(t);
      candidatos.push(...(Array.isArray(j) ? j : [j]));
    } catch {
      // No era JSON: puede ser un flujo de eventos.
    }
  }
  for (const linea of t.split(/\r?\n/)) {
    if (!linea.startsWith("data:")) continue;
    try {
      candidatos.push(JSON.parse(linea.slice(5).trim()));
    } catch {
      // Una línea que no es JSON se salta.
    }
  }
  const r = candidatos.find((c) => typeof c === "object" && c !== null && (c as { id?: unknown }).id === id) as { result?: unknown; error?: { code?: number; message?: string } } | undefined;
  return r ?? null;
}

/**
 * Lo que devuelve una herramienta: si trae `structuredContent`, eso; si no, el texto de su contenido leído como JSON (o el texto tal cual). `esError` si la
 * herramienta dijo que falló (`isError`).
 */
export function contenidoHerramienta(result: unknown): { datos: unknown; esError: boolean } {
  const r = typeof result === "object" && result !== null ? (result as { content?: unknown; structuredContent?: unknown; isError?: unknown }) : {};
  // El texto manda: en iComfly el `structuredContent` llega con las fechas vacías («{}»: 13 nov 2026) y el texto las trae bien.
  const enTexto = (Array.isArray(r.content) ? r.content : []).some((c) => typeof c === "object" && c !== null && (c as { type?: unknown }).type === "text");
  if (!enTexto && r.structuredContent !== undefined) return { datos: r.structuredContent, esError: r.isError === true };
  const textos = (Array.isArray(r.content) ? r.content : []).filter((c): c is { type: string; text: string } => typeof c === "object" && c !== null && (c as { type?: unknown }).type === "text" && typeof (c as { text?: unknown }).text === "string").map((c) => c.text);
  const junto = textos.join("\n").trim();
  let datos: unknown = junto;
  try {
    datos = junto ? JSON.parse(junto) : null;
  } catch {
    // Texto suelto.
  }
  return { datos, esError: r.isError === true };
}
