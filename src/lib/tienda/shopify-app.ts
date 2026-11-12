// Conexión en vivo de una tienda de Shopify (12 nov 2026, pedido de Hernán: «si cae un pedido, nos cae a nosotros en el sistema y nos da un aviso»).
// Desde el 1 ene 2026 Shopify ya no deja crear apps propias en el admin de la tienda: se crean en el Dev Dashboard y dan un Client ID y un Client secret,
// no un token fijo. El token se pide con el «client credentials grant» (POST /admin/oauth/access_token), dura 24 horas y aquí se guarda en memoria hasta
// un rato antes de vencer. La app tiene solo permisos de lectura: el sistema nunca cambia nada en Shopify.
//
// Cada tienda va en Vercel con tres variables (nunca en el código ni en un chat):
//   SHOPIFY_<TIENDA>_CLIENT_ID, SHOPIFY_<TIENDA>_CLIENT_SECRET, SHOPIFY_<TIENDA>_DOMINIO (xxx.myshopify.com)
// <TIENDA> es el nombre de su unidad en Finanzas: SHOPIFY_KENKU_… es Kenku. Solo servidor.

import { nombreComparable } from "./ordenes-finanzas";

export interface AppTienda {
  /** El nombre de la tienda como su unidad de Finanzas («KENKU»): con él se guardan sus órdenes. */
  tienda: string;
  dominio: string;
  clientId: string;
  clientSecret: string;
}

const DOMINIO = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** Las tiendas configuradas en las variables de entorno: las que tienen las tres variables y un dominio `*.myshopify.com` válido. */
export function appsDeEntorno(env: Record<string, string | undefined> = process.env): AppTienda[] {
  const apps: AppTienda[] = [];
  for (const clave of Object.keys(env).sort()) {
    const m = /^SHOPIFY_([A-Z0-9_]+)_CLIENT_ID$/.exec(clave);
    if (!m) continue;
    const nombre = m[1];
    const clientId = (env[clave] ?? "").trim();
    const clientSecret = (env[`SHOPIFY_${nombre}_CLIENT_SECRET`] ?? "").trim();
    const dominio = (env[`SHOPIFY_${nombre}_DOMINIO`] ?? "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!clientId || !clientSecret || !DOMINIO.test(dominio)) continue;
    apps.push({ tienda: nombre.replace(/_/g, " "), dominio, clientId, clientSecret });
  }
  return apps;
}

/** La app de una tienda del sistema («Kenku» → la de SHOPIFY_KENKU_…), o null. */
export function appDeTienda(nombreTienda: string, apps: AppTienda[] = appsDeEntorno()): AppTienda | null {
  const n = nombreComparable(nombreTienda);
  return apps.find((a) => nombreComparable(a.tienda) === n) ?? null;
}

/** La app que manda un aviso de Shopify, por el dominio de la cabecera `X-Shopify-Shop-Domain`. */
export function appDeDominio(dominio: string, apps: AppTienda[] = appsDeEntorno()): AppTienda | null {
  const d = dominio.trim().toLowerCase();
  return apps.find((a) => a.dominio === d) ?? null;
}

const tokens = new Map<string, { token: string; scope: string; vence: number }>();
/** Se pide uno nuevo 30 minutos antes de que venza el anterior. */
const MARGEN_MS = 30 * 60_000;

/** El token de la app (Admin API). Lanza un error con palabras del equipo si Shopify no lo da. */
export async function tokenDeApp(app: AppTienda, ahora = Date.now()): Promise<string> {
  return (await accesoDeApp(app, ahora)).token;
}

/** El token y los permisos que la tienda le dio a la app (`scope`, separados por coma). */
export async function accesoDeApp(app: AppTienda, ahora = Date.now()): Promise<{ token: string; scope: string }> {
  const guardado = tokens.get(app.dominio);
  if (guardado && guardado.vence - MARGEN_MS > ahora) return guardado;
  const r = await fetch(`https://${app.dominio}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: app.clientId, client_secret: app.clientSecret }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const cuerpo = (await r.json().catch(() => ({}))) as { access_token?: string; scope?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !cuerpo.access_token) {
    const motivo = cuerpo.error_description || cuerpo.error || `HTTP ${r.status}`;
    throw new Error(`Shopify no dio acceso a ${app.tienda} (${motivo}). Revisa que la app esté instalada en la tienda y que el Client ID y el secret sean los de esa app.`);
  }
  const acceso = { token: cuerpo.access_token, scope: cuerpo.scope ?? "", vence: ahora + (Number(cuerpo.expires_in) || 86_399) * 1000 };
  tokens.set(app.dominio, acceso);
  return acceso;
}

/** Los permisos de escritura que una app de solo lectura no debe tener (`write_…`). */
export function permisosDeEscritura(scope: string | null | undefined): string[] {
  return (scope ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("write_"));
}
