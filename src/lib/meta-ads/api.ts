// Anuncios Meta: el cliente de la Marketing API de Meta (Graph API). Solo LEE: nada de lo que hace el sistema crea, pausa ni cambia una campaña. El acceso es un token de un «usuario del sistema» del negocio de Meta
// con permisos de lectura (`ads_read`), guardado solo en el servidor (`META_ADS_ACCESS_TOKEN`; nunca `NEXT_PUBLIC_`, nunca a la pantalla ni a los registros). Lo que contesta Meta se revisa en `normalizar.ts`.

import { mensajeDeErrorMeta } from "./normalizar";

export const VERSION_API = (process.env.META_ADS_API_VERSION ?? "v23.0").replace(/[^v0-9.]/g, "") || "v23.0";
const BASE = `https://graph.facebook.com/${VERSION_API}`;
const HOST = "graph.facebook.com";
const ESPERA_MS = 25_000;

/** El token de acceso, o null si todavía no se configuró. */
export const tokenDeMeta = (): string | null => process.env.META_ADS_ACCESS_TOKEN?.trim() || null;

export type RespuestaMeta = { ok: true; datos: unknown } | { ok: false; error: string };

type Parametros = Record<string, string | number | undefined>;

/** Los códigos con que Meta pide esperar («demasiadas consultas»). */
const CODIGOS_DE_ESPERA = new Set([4, 17, 32, 613, 80000, 80004]);
/**
 * Si Meta contestó con un error pasajero y conviene repetir la consulta: pide esperar (códigos de límite), o dice «An unexpected error has occurred. Please retry your request later» (códigos 1 y 2, o
 * `is_transient`). 20 nov 2026: el registro de actividad de Oferfy Panamá II fallaba con ese mensaje y no se reintentaba.
 */
export function esErrorPasajeroDeMeta(cuerpo: unknown): boolean {
  const e = (cuerpo as { error?: { code?: unknown; is_transient?: unknown } } | null)?.error;
  if (!e) return false;
  return (typeof e.code === "number" && (CODIGOS_DE_ESPERA.has(e.code) || e.code === 1 || e.code === 2)) || e.is_transient === true;
}
const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

async function pedirUrl(url: string, token: string, hasta?: number): Promise<RespuestaMeta> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, error: "Meta devolvió una dirección que no se entiende." };
  }
  // La paginación de Meta trae su propia dirección: solo se sigue si es de Meta (nunca el token a otro sitio).
  if (u.protocol !== "https:" || u.hostname !== HOST) return { ok: false, error: "Meta devolvió una dirección de otro sitio: se ignoró." };
  u.searchParams.set("access_token", token);
  // Si Meta pide esperar (demasiadas consultas) o una página tarda más de la cuenta, se reintenta hasta 2 veces mientras quede tiempo (`hasta`, en milisegundos de reloj); el resto sigue como antes.
  let ultimo: RespuestaMeta = { ok: false, error: "No se pudo hablar con Meta." };
  for (let intento = 0; intento < 3; intento++) {
    const quedan = hasta === undefined ? ESPERA_MS : Math.min(ESPERA_MS, hasta - Date.now());
    if (quedan < 2_000) return intento === 0 ? { ok: false, error: "Meta tardó demasiado en contestar." } : ultimo;
    let reintentar = false;
    try {
      const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(quedan) });
      const cuerpo: unknown = await r.json().catch(() => null);
      if (r.ok) return { ok: true, datos: cuerpo };
      ultimo = { ok: false, error: mensajeDeErrorMeta(r.status, cuerpo) };
      reintentar = esErrorPasajeroDeMeta(cuerpo);
    } catch (e) {
      ultimo = { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "Meta tardó demasiado en contestar." : "No se pudo hablar con Meta." };
      reintentar = true;
    }
    if (!reintentar || intento === 2) break;
    const pausa = (intento + 1) * 8_000;
    if (hasta !== undefined && hasta - Date.now() < pausa + 5_000) break;
    await esperar(pausa);
  }
  return ultimo;
}

/** Una consulta a la API: `pedirMeta("/act_123/campaigns", { fields: "id,name" }, token)`. */
export function pedirMeta(ruta: string, parametros: Parametros, token: string, hasta?: number): Promise<RespuestaMeta> {
  const u = new URL(`${BASE}${ruta.startsWith("/") ? ruta : `/${ruta}`}`);
  for (const [k, v] of Object.entries(parametros)) if (v !== undefined) u.searchParams.set(k, String(v));
  return pedirUrl(u.toString(), token, hasta);
}

/**
 * Todas las páginas de una lista (hasta `maxPaginas`). Con `hasta` (milisegundos de reloj) deja de pedir páginas cuando se acaba el tiempo y lo dice con `incompleta` (20 nov 2026: un mes de una cuenta grande
 * pedía más páginas de las que caben en una llamada y la lectura quedaba colgada sin avisar).
 */
export async function pedirTodo(ruta: string, parametros: Parametros, token: string, maxPaginas = 30, hasta?: number): Promise<{ filas: unknown[]; error: string | null; incompleta: boolean }> {
  const filas: unknown[] = [];
  let r = await pedirMeta(ruta, parametros, token, hasta);
  for (let pagina = 1; ; pagina++) {
    if (!r.ok) return { filas, error: r.error, incompleta: filas.length > 0 };
    const cuerpo = r.datos as { data?: unknown; paging?: { next?: unknown } };
    if (Array.isArray(cuerpo.data)) filas.push(...cuerpo.data);
    const siguiente = typeof cuerpo.paging?.next === "string" ? cuerpo.paging.next : null;
    if (!siguiente) return { filas, error: null, incompleta: false };
    if (pagina >= maxPaginas || (hasta !== undefined && Date.now() > hasta)) return { filas, error: null, incompleta: true };
    r = await pedirUrl(siguiente, token, hasta);
  }
}

/**
 * Varios objetos por su id, con el lote oficial de Meta (`POST /` con `batch`, hasta 50 consultas a la vez): el parámetro `ids` de la API quedó obsoleto desde la v26. Devuelve un objeto por id; lo que Meta
 * no deja leer (o falla) simplemente no viene, y el error de la primera consulta fallida se cuenta aparte.
 */
export async function pedirPorIds(ids: string[], campos: string, token: string, hasta?: number): Promise<{ objetos: Map<string, unknown>; error: string | null }> {
  const objetos = new Map<string, unknown>();
  let error: string | null = null;
  const validos = ids.filter((i) => /^[0-9]{5,25}$/.test(i));
  for (let i = 0; i < validos.length; i += 50) {
    if (hasta !== undefined && Date.now() > hasta) {
      error ??= "Se acabó el tiempo de esta lectura antes de leer toda la estructura.";
      break;
    }
    const trozo = validos.slice(i, i + 50);
    const cuerpo = new URLSearchParams({ access_token: token, include_headers: "false", batch: JSON.stringify(trozo.map((id) => ({ method: "GET", relative_url: `${id}?fields=${encodeURIComponent(campos)}` }))) });
    try {
      const r = await fetch(BASE, { method: "POST", body: cuerpo, cache: "no-store", signal: AbortSignal.timeout(ESPERA_MS) });
      const datos: unknown = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(datos)) {
        error ??= mensajeDeErrorMeta(r.status, datos);
        continue;
      }
      datos.forEach((respuesta, k) => {
        const o = respuesta as { code?: unknown; body?: unknown } | null;
        let cuerpoRespuesta: unknown = null;
        try {
          cuerpoRespuesta = typeof o?.body === "string" ? JSON.parse(o.body) : null;
        } catch {
          cuerpoRespuesta = null;
        }
        if (o?.code === 200 && cuerpoRespuesta && typeof cuerpoRespuesta === "object") objetos.set(trozo[k], cuerpoRespuesta);
        else error ??= mensajeDeErrorMeta(typeof o?.code === "number" ? o.code : 400, cuerpoRespuesta);
      });
    } catch (e) {
      error ??= e instanceof Error && e.name === "TimeoutError" ? "Meta tardó demasiado en contestar." : "No se pudo hablar con Meta.";
    }
  }
  return { objetos, error };
}
