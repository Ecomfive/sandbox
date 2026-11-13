// iComfly (13 nov 2026, pedido de Hernán): el sistema habla con el «Conector Claude» de cada tienda (servidor MCP) como cliente OAuth, igual que Claude.ai.
// Aquí lo que va por red: registrar el cliente, cambiar el código por los tokens, renovarlos y llamar las herramientas (`tools/call`). Los tokens se guardan
// cifrados en `tienda_icomfly` (migración 0284) y nunca salen del servidor. Las piezas sin red, con prueba, están en `icomfly-oauth.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cifrar, descifrar } from "@/lib/seguridad/cifrado-tokens";
import {
  claveIcomfly,
  contenidoHerramienta,
  ICOMFLY_API,
  leerTokensIcomfly,
  nuevoPkce,
  respuestaRpc,
  urlAutorizacionIcomfly,
  venceProntoIcomfly,
  type TokensIcomfly,
} from "./icomfly-oauth";

export const SIN_MIGRACION_ICOMFLY = "Falta correr la migración 0284 (iComfly) en Supabase.";
const PROTOCOLO = "2025-06-18";
const TIEMPO = 25_000;

export interface ConexionIcomfly {
  tiendaId: string;
  mcpUrl: string;
  conectado: boolean;
  conectadoEn: string | null;
  ultimaPrueba: string | null;
  ultimoError: string | null;
}

type Fila = Record<string, unknown>;
const falta = (m: string | undefined) => /tienda_icomfly|schema cache|does not exist/i.test(m ?? "");

/** La conexión de cada tienda (sin tokens). `null` si falta la migración. */
export async function conexionesIcomfly(supabase: SupabaseClient, tiendaIds: string[]): Promise<Map<string, ConexionIcomfly> | null> {
  if (!tiendaIds.length) return new Map();
  const { data, error } = await supabase.from("tienda_icomfly").select("tienda_id, mcp_url, access_cifrado, conectado_en, ultima_prueba, ultimo_error").in("tienda_id", tiendaIds);
  if (error) return falta(error.message) ? null : new Map();
  return new Map(
    (data ?? []).map((f) => [
      f.tienda_id as string,
      {
        tiendaId: f.tienda_id as string,
        mcpUrl: f.mcp_url as string,
        conectado: !!f.access_cifrado,
        conectadoEn: (f.conectado_en as string | null) ?? null,
        ultimaPrueba: (f.ultima_prueba as string | null) ?? null,
        ultimoError: (f.ultimo_error as string | null) ?? null,
      },
    ]),
  );
}

/** Guarda (o cambia) la dirección del conector de una tienda. Cambiarla borra la autorización anterior. */
export async function guardarUrlConector(supabase: SupabaseClient, tiendaId: string, mcpUrl: string): Promise<{ error?: string }> {
  const { data: antes, error: e1 } = await supabase.from("tienda_icomfly").select("mcp_url").eq("tienda_id", tiendaId).maybeSingle();
  if (e1) return { error: falta(e1.message) ? SIN_MIGRACION_ICOMFLY : "No se pudo leer la conexión." };
  const cambia = !antes || antes.mcp_url !== mcpUrl;
  const { error } = await supabase.from("tienda_icomfly").upsert(
    {
      tienda_id: tiendaId,
      mcp_url: mcpUrl,
      ...(cambia ? { access_cifrado: null, refresh_cifrado: null, expira_en: null, conectado_en: null, ultima_prueba: null, ultimo_error: null } : {}),
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "tienda_id" },
  );
  return error ? { error: "No se pudo guardar la dirección del conector." } : {};
}

/** Registra el sistema como cliente en iComfly para esa dirección de retorno (registro dinámico, sin secreto: PKCE). */
async function registrarCliente(redirectUri: string): Promise<string> {
  const r = await fetch(`${ICOMFLY_API}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "Ecomfive Sistema",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp read",
    }),
    signal: AbortSignal.timeout(TIEMPO),
  });
  const j = (await r.json().catch(() => ({}))) as { client_id?: string; error_description?: string; error?: string };
  if (!r.ok || !j.client_id) throw new Error(`iComfly no registró el cliente (${r.status}${j.error_description || j.error ? `: ${j.error_description ?? j.error}` : ""}).`);
  return j.client_id;
}

/** Empieza la autorización: registra el cliente si hace falta, guarda el verificador PKCE (cifrado) y devuelve a dónde mandar a la persona. */
export async function empezarAutorizacion(supabase: SupabaseClient, tiendaId: string, redirectUri: string, state: string): Promise<{ url: string } | { error: string }> {
  const clave = claveIcomfly();
  if (!clave) return { error: "Falta la clave para cifrar los tokens (SUPABASE_SERVICE_ROLE_KEY o ICOMFLY_TOKEN_KEY)." };
  const { data: f, error } = await supabase.from("tienda_icomfly").select("mcp_url, client_id, redirect_uri").eq("tienda_id", tiendaId).maybeSingle();
  if (error) return { error: falta(error.message) ? SIN_MIGRACION_ICOMFLY : "No se pudo leer la conexión." };
  if (!f) return { error: "Primero pega la dirección del conector de la tienda." };
  let clientId = (f.client_id as string | null) ?? null;
  try {
    if (!clientId || f.redirect_uri !== redirectUri) clientId = await registrarCliente(redirectUri);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { verificador, desafio } = nuevoPkce();
  const { error: e2 } = await supabase
    .from("tienda_icomfly")
    .update({ client_id: clientId, redirect_uri: redirectUri, pkce_cifrado: cifrar(verificador, clave), actualizado_en: new Date().toISOString() })
    .eq("tienda_id", tiendaId);
  if (e2) return { error: "No se pudo preparar la autorización." };
  return { url: urlAutorizacionIcomfly({ clientId, redirectUri, desafio, state, recurso: f.mcp_url as string }) };
}

async function pedirTokens(cuerpo: Record<string, string>): Promise<TokensIcomfly> {
  const r = await fetch(`${ICOMFLY_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(cuerpo).toString(),
    signal: AbortSignal.timeout(TIEMPO),
  });
  const j = await r.json().catch(() => ({}));
  const t = r.ok ? leerTokensIcomfly(j, Date.now()) : null;
  if (!t) throw new Error(`iComfly no entregó los tokens (${r.status}${(j as { error?: string }).error ? `: ${(j as { error?: string }).error}` : ""}).`);
  return t;
}

/** Termina la autorización: cambia el código por los tokens y los guarda cifrados. */
export async function terminarAutorizacion(supabase: SupabaseClient, tiendaId: string, codigo: string, usuarioId: string): Promise<{ error?: string }> {
  const clave = claveIcomfly();
  if (!clave) return { error: "Falta la clave para cifrar los tokens." };
  const { data: f } = await supabase.from("tienda_icomfly").select("mcp_url, client_id, redirect_uri, pkce_cifrado").eq("tienda_id", tiendaId).maybeSingle();
  const verificador = f?.pkce_cifrado ? descifrar(f.pkce_cifrado as string, clave) : null;
  if (!f || !f.client_id || !f.redirect_uri || !verificador) return { error: "La autorización no se empezó desde el sistema: vuelve a pulsar «Conectar iComfly»." };
  try {
    const t = await pedirTokens({ grant_type: "authorization_code", code: codigo, redirect_uri: f.redirect_uri as string, client_id: f.client_id as string, code_verifier: verificador, resource: f.mcp_url as string });
    await guardarTokens(supabase, tiendaId, t, clave, { conectadoPor: usuarioId });
    return {};
  } catch (e) {
    await supabase.from("tienda_icomfly").update({ ultimo_error: (e as Error).message.slice(0, 300) }).eq("tienda_id", tiendaId);
    return { error: (e as Error).message };
  }
}

async function guardarTokens(supabase: SupabaseClient, tiendaId: string, t: TokensIcomfly, clave: Buffer, extra: { conectadoPor?: string } = {}) {
  const ahora = new Date().toISOString();
  await supabase
    .from("tienda_icomfly")
    .update({
      access_cifrado: cifrar(t.access, clave),
      ...(t.refresh ? { refresh_cifrado: cifrar(t.refresh, clave) } : {}),
      expira_en: t.expiraEn,
      pkce_cifrado: null,
      ultimo_error: null,
      actualizado_en: ahora,
      ...(extra.conectadoPor ? { conectado_en: ahora, conectado_por: extra.conectadoPor } : {}),
    })
    .eq("tienda_id", tiendaId);
}

/** El token vigente de la tienda (lo renueva si vence en menos de 2 minutos). */
async function tokenVigente(supabase: SupabaseClient, tiendaId: string): Promise<{ token: string; mcpUrl: string } | { error: string }> {
  const clave = claveIcomfly();
  if (!clave) return { error: "Falta la clave para descifrar los tokens." };
  const { data: f, error } = await supabase.from("tienda_icomfly").select("mcp_url, client_id, access_cifrado, refresh_cifrado, expira_en").eq("tienda_id", tiendaId).maybeSingle();
  if (error) return { error: falta(error.message) ? SIN_MIGRACION_ICOMFLY : "No se pudo leer la conexión con iComfly." };
  if (!f?.access_cifrado) return { error: "La tienda no está conectada a iComfly." };
  const acceso = descifrar(f.access_cifrado as string, clave);
  if (!acceso) return { error: "No se pudo leer el token de iComfly: vuelve a conectar la tienda." };
  if (!venceProntoIcomfly((f.expira_en as string | null) ?? null, Date.now())) return { token: acceso, mcpUrl: f.mcp_url as string };
  const refresh = f.refresh_cifrado ? descifrar(f.refresh_cifrado as string, clave) : null;
  if (!refresh || !f.client_id) return { token: acceso, mcpUrl: f.mcp_url as string };
  try {
    const t = await pedirTokens({ grant_type: "refresh_token", refresh_token: refresh, client_id: f.client_id as string, resource: f.mcp_url as string });
    await guardarTokens(supabase, tiendaId, t, clave);
    return { token: t.access, mcpUrl: f.mcp_url as string };
  } catch (e) {
    await supabase.from("tienda_icomfly").update({ ultimo_error: (e as Error).message.slice(0, 300) }).eq("tienda_id", tiendaId);
    return { error: "iComfly no renovó el acceso: vuelve a conectar la tienda." };
  }
}

/** Una sesión MCP por tienda, mientras el proceso viva (el servidor la puede dar o no). */
const sesiones = new Map<string, { id: string | null; vence: number }>();
let siguienteId = 1;

async function rpc(url: string, token: string, metodo: string, params: unknown, sesion: string | null, notificacion = false) {
  const id = siguienteId++;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
      "MCP-Protocol-Version": PROTOCOLO,
      ...(sesion ? { "Mcp-Session-Id": sesion } : {}),
    },
    body: JSON.stringify(notificacion ? { jsonrpc: "2.0", method: metodo, params } : { jsonrpc: "2.0", id, method: metodo, params }),
    signal: AbortSignal.timeout(TIEMPO),
  });
  const texto = await r.text();
  return { status: r.status, sesion: r.headers.get("mcp-session-id"), respuesta: notificacion ? null : respuestaRpc(texto, id) };
}

async function sesionDe(tiendaId: string, url: string, token: string, nueva = false): Promise<string | null> {
  const s = sesiones.get(tiendaId);
  if (!nueva && s && s.vence > Date.now()) return s.id;
  const ini = await rpc(url, token, "initialize", { protocolVersion: PROTOCOLO, capabilities: {}, clientInfo: { name: "Ecomfive Sistema", version: "1.0" } }, null);
  if (ini.status === 401) throw new Error("iComfly rechazó el acceso: vuelve a conectar la tienda.");
  if (!ini.respuesta || ini.respuesta.error) throw new Error(`iComfly no inició la conexión (${ini.status}${ini.respuesta?.error?.message ? `: ${ini.respuesta.error.message}` : ""}).`);
  await rpc(url, token, "notifications/initialized", {}, ini.sesion, true).catch(() => null);
  sesiones.set(tiendaId, { id: ini.sesion, vence: Date.now() + 10 * 60_000 });
  return ini.sesion;
}

/** Llama un método MCP de la tienda (con sesión; si la sesión venció, la renueva una vez). */
async function llamar(supabase: SupabaseClient, tiendaId: string, metodo: string, params: unknown): Promise<{ result: unknown } | { error: string }> {
  const acceso = await tokenVigente(supabase, tiendaId);
  if ("error" in acceso) return acceso;
  try {
    for (const nueva of [false, true]) {
      const sesion = await sesionDe(tiendaId, acceso.mcpUrl, acceso.token, nueva);
      const r = await rpc(acceso.mcpUrl, acceso.token, metodo, params, sesion);
      if ((r.status === 404 || r.status === 400) && !nueva) continue;
      if (r.status === 401) return { error: "iComfly rechazó el acceso: vuelve a conectar la tienda." };
      if (!r.respuesta) return { error: `iComfly no respondió (${r.status}).` };
      if (r.respuesta.error) return { error: r.respuesta.error.message ?? "iComfly devolvió un error." };
      return { result: r.respuesta.result };
    }
    return { error: "iComfly no aceptó la sesión." };
  } catch (e) {
    return { error: (e as Error).name === "TimeoutError" ? "iComfly tardó demasiado en responder." : (e as Error).message };
  }
}

export interface HerramientaIcomfly {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

/** Las herramientas que el conector de la tienda permite. */
export async function herramientasIcomfly(supabase: SupabaseClient, tiendaId: string): Promise<{ herramientas: HerramientaIcomfly[] } | { error: string }> {
  const todas: HerramientaIcomfly[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = await llamar(supabase, tiendaId, "tools/list", cursor ? { cursor } : {});
    if ("error" in r) return r;
    const res = r.result as { tools?: HerramientaIcomfly[]; nextCursor?: string };
    todas.push(...(res.tools ?? []));
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return { herramientas: todas };
}

/** Llama una herramienta del conector (`ver_conversacion_whatsapp`, `enviar_mensaje_whatsapp`…) y devuelve lo que contestó. */
export async function herramientaIcomfly(supabase: SupabaseClient, tiendaId: string, nombre: string, args: Record<string, unknown>): Promise<{ datos: unknown } | { error: string }> {
  const r = await llamar(supabase, tiendaId, "tools/call", { name: nombre, arguments: args });
  if ("error" in r) return r;
  const c = contenidoHerramienta(r.result);
  if (c.esError) return { error: typeof c.datos === "string" ? c.datos.slice(0, 300) : `iComfly no pudo hacer «${nombre}».` };
  return { datos: c.datos };
}

/** Prueba la conexión: la identidad de la tienda en iComfly y cuántas herramientas permite. Deja anotado el resultado. */
export async function probarIcomfly(supabase: SupabaseClient, tiendaId: string): Promise<{ resumen: string } | { error: string }> {
  const [info, lista] = await Promise.all([herramientaIcomfly(supabase, tiendaId, "info_tienda", {}), herramientasIcomfly(supabase, tiendaId)]);
  if ("error" in lista) {
    await supabase.from("tienda_icomfly").update({ ultimo_error: lista.error.slice(0, 300) }).eq("tienda_id", tiendaId);
    return lista;
  }
  const d = "datos" in info && info.datos && typeof info.datos === "object" ? (info.datos as Fila) : null;
  const nombre = d ? String(d.nombre ?? d.name ?? d.tienda ?? "").trim() : "";
  const resumen = `${nombre || "Conectada"} · ${lista.herramientas.length} funciones`;
  await supabase.from("tienda_icomfly").update({ ultima_prueba: resumen, ultimo_error: null }).eq("tienda_id", tiendaId);
  return { resumen };
}

/** Desconecta: borra los tokens (la dirección del conector queda). */
export async function desconectarIcomfly(supabase: SupabaseClient, tiendaId: string): Promise<{ error?: string }> {
  sesiones.delete(tiendaId);
  const { error } = await supabase
    .from("tienda_icomfly")
    .update({ access_cifrado: null, refresh_cifrado: null, expira_en: null, conectado_en: null, ultima_prueba: null, actualizado_en: new Date().toISOString() })
    .eq("tienda_id", tiendaId);
  return error ? { error: "No se pudo desconectar." } : {};
}
