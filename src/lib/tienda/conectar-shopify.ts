// Conectar una tienda de Shopify en vivo y revisarla (12 nov 2026). Ver src/lib/tienda/shopify-app.ts. Solo lectura de Shopify: lo único que se pide allá
// es que avise de los pedidos (las suscripciones de avisos son de la app, no cambian la tienda). Los pedidos se guardan en `ven_ordenes` con el mismo
// camino que la lectura de Finanzas (`sincronizarTienda`), así Finanzas y Tiendas ven las mismas órdenes. Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sincronizarTienda } from "@/lib/finanzas/sincronizar-shopify";
import { accesoDeApp, appDeTienda, permisosDeEscritura, type AppTienda } from "./shopify-app";
import { completarTelefonosDeTienda } from "./telefono-cliente";

const VERSION_API = "2026-07";
/** Los avisos que se piden: pedido nuevo, cambios, cancelación, pago y edición (los mismos que entiende el receptor). */
const AVISOS = ["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED", "ORDERS_PAID", "ORDERS_EDITED"] as const;
/** Lo mínimo que la app tiene que poder leer. */
const PERMISOS_NECESARIOS = ["read_orders"];

/** La dirección pública del sistema (a donde Shopify manda los avisos). */
export function urlDelSistema(env: Record<string, string | undefined> = process.env): string | null {
  const v = env.PORTAL_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const limpio = v.trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+$/i.test(limpio) ? limpio : null;
}

async function graphql<T>(app: AppTienda, token: string, query: string, variables: Record<string, unknown> = {}): Promise<{ data?: T; errores: string[] }> {
  const r = await fetch(`https://${app.dominio}/admin/api/${VERSION_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token, Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status === 401 || r.status === 403) return { errores: [`Shopify rechazó el acceso (${r.status}).`] };
  if (!r.ok) return { errores: [`Shopify respondió ${r.status}.`] };
  const cuerpo = (await r.json()) as { data?: T; errors?: { message: string }[] };
  return { data: cuerpo.data, errores: (cuerpo.errors ?? []).map((e) => e.message) };
}

/** Pide a Shopify los avisos de pedidos hacia el sistema (los que ya existen no se repiten). Devuelve cuántos se crearon. */
export async function registrarAvisos(app: AppTienda, token: string, urlBase: string): Promise<{ creados: number; yaEstaban: number }> {
  const destino = `${urlBase}/api/shopify/webhooks`;
  const lista = await graphql<{ webhookSubscriptions: { nodes: { topic: string; uri?: string }[] } }>(app, token, "{ webhookSubscriptions(first: 100) { nodes { topic uri } } }");
  if (lista.errores.length) throw new Error(`No se pudieron leer los avisos de ${app.tienda}: ${lista.errores.join("; ")}`);
  const existentes = new Set((lista.data?.webhookSubscriptions.nodes ?? []).filter((n) => n.uri === destino).map((n) => n.topic));
  let creados = 0;
  for (const tema of AVISOS) {
    if (existentes.has(tema)) continue;
    const r = await graphql<{ webhookSubscriptionCreate: { userErrors: { message: string }[] } }>(
      app,
      token,
      "mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) { webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) { userErrors { message } } }",
      { topic: tema, sub: { uri: destino } },
    );
    const errores = [...r.errores, ...(r.data?.webhookSubscriptionCreate.userErrors ?? []).map((e) => e.message)];
    if (errores.length) throw new Error(`Shopify no aceptó el aviso ${tema} de ${app.tienda}: ${errores.join("; ")}`);
    creados++;
  }
  return { creados, yaEstaban: existentes.size };
}

/** El último día con órdenes de esa unidad que no vinieron de Shopify (el Excel de Finanzas), para traer desde un poco antes. */
async function ultimoDiaDelExcel(supabase: SupabaseClient, tienda: string): Promise<string | null> {
  const { data: u } = await supabase.from("fin_unidades").select("id").ilike("nombre", tienda).maybeSingle();
  if (!u) return null;
  const { data } = await supabase.from("ven_ordenes").select("fecha").eq("unidad_id", u.id).neq("origen", "shopify").order("fecha", { ascending: false }).limit(1).maybeSingle();
  return (data?.fecha as string | undefined) ?? null;
}

export interface ResultadoConexion {
  tienda: string;
  avisos: { creados: number; yaEstaban: number };
  traidos: string;
  completa: boolean;
}

/**
 * Conecta una tienda del sistema con su app de Shopify: prueba el acceso (y se niega si la app puede escribir), pide los avisos de pedidos, marca la
 * tienda como conectada y trae lo que pasó desde unos días antes del último día del Excel (lo del Excel no se pisa). Lanza el error con palabras del equipo.
 */
export async function conectarTienda(supabase: SupabaseClient, tiendaId: string, limiteMs = 40_000): Promise<ResultadoConexion> {
  const { data: t } = await supabase.from("tiendas").select("id, nombre").eq("id", tiendaId).maybeSingle();
  if (!t) throw new Error("La tienda ya no existe.");
  const app = appDeTienda(t.nombre as string);
  if (!app) throw new Error(`Faltan las variables de ${t.nombre} en Vercel (SHOPIFY_${String(t.nombre).toUpperCase()}_CLIENT_ID, _CLIENT_SECRET y _DOMINIO).`);
  const urlBase = urlDelSistema();
  if (!urlBase) throw new Error("No se sabe la dirección pública del sistema (PORTAL_URL) para recibir los avisos de Shopify.");
  const { token, scope } = await accesoDeApp(app);
  const escritura = permisosDeEscritura(scope);
  if (escritura.length) throw new Error(`La app de ${t.nombre} tiene permisos de escritura (${escritura.join(", ")}). Debe ser solo de lectura: quítaselos en el Dev Dashboard y vuelve a conectar.`);
  const faltan = PERMISOS_NECESARIOS.filter((p) => !scope.split(",").map((s) => s.trim()).includes(p));
  if (faltan.length) throw new Error(`La app de ${t.nombre} no tiene permiso para ${faltan.join(", ")}.`);
  const avisos = await registrarAvisos(app, token, urlBase);
  await supabase.from("tiendas").update({ estado: "conectada", dominio: app.dominio, conectada_en: new Date().toISOString() }).eq("id", tiendaId);
  const excel = await ultimoDiaDelExcel(supabase, app.tienda);
  const desde = excel ? new Date(Date.parse(`${excel}T00:00:00Z`) - 3 * 86_400_000).toISOString() : undefined;
  const r = await sincronizarTienda(supabase, { tienda: app.tienda, dominio: app.dominio, token }, Date.now() + limiteMs, desde);
  await supabase.from("tiendas").update({ ultima_revision_en: new Date().toISOString() }).eq("id", tiendaId);
  return { tienda: t.nombre as string, avisos, traidos: r.texto, completa: r.completa };
}

/** El día (ISO) de la orden de Shopify más vieja de esa tienda que todavía no tiene su hora, o undefined (o sin la migración 0276). */
async function desdeSinHora(supabase: SupabaseClient, tienda: string): Promise<string | undefined> {
  const { data: u } = await supabase.from("fin_unidades").select("id").ilike("nombre", tienda).maybeSingle();
  if (!u) return undefined;
  const { data, error } = await supabase
    .from("ven_ordenes")
    .select("fecha")
    .eq("unidad_id", u.id)
    .eq("origen", "shopify")
    .is("creado_origen", null)
    .order("fecha")
    .limit(1)
    .maybeSingle();
  if (error || !data) return undefined;
  return new Date(Date.parse(`${data.fecha}T00:00:00Z`) - 86_400_000).toISOString();
}

/** La revisión: trae lo que cambió en Shopify desde la última lectura (por si se perdió algún aviso). */
export async function revisarTienda(supabase: SupabaseClient, tienda: { id: string; nombre: string }, limiteMs = 25_000): Promise<{ texto: string; completa: boolean }> {
  const app = appDeTienda(tienda.nombre);
  if (!app) throw new Error(`Faltan las variables de ${tienda.nombre} en Vercel.`);
  const token = (await accesoDeApp(app)).token;
  // Las órdenes de Shopify que entraron antes de guardar su hora (migración 0276) se vuelven a leer desde la más vieja, para completarla.
  const desde = await desdeSinHora(supabase, app.tienda);
  const r = await sincronizarTienda(supabase, { tienda: app.tienda, dominio: app.dominio, token }, Date.now() + limiteMs, desde);
  // Los clientes de los pedidos que llegaron antes sin su teléfono normalizado (para juntar sus pedidos).
  const { data: u } = await supabase.from("fin_unidades").select("id").ilike("nombre", app.tienda).maybeSingle();
  if (u) await completarTelefonosDeTienda(supabase, u.id as string);
  await supabase.from("tiendas").update({ ultima_revision_en: new Date().toISOString() }).eq("id", tienda.id);
  return r;
}

/** Cada cuánto, como mínimo, se revisa Shopify al abrir Pedidos o el Dashboard. */
export const REVISION_MS = 10 * 60_000;

/**
 * La revisión de cada 10 minutos sin un cron por minuto (12 nov 2026): al abrir Pedidos o el Dashboard, las tiendas conectadas cuya última revisión tiene más
 * de 10 minutos se revisan después de mostrar la página (`after`). Se marca la hora antes de revisar, así dos pestañas a la vez no revisan dos veces. Nunca lanza.
 */
export async function revisarSiHaceFalta(supabase: SupabaseClient, tiendas: { id: string; nombre: string; estado: string; ultimaRevisionEn: string | null }[], ahora = Date.now()): Promise<void> {
  for (const t of tiendas) {
    if (t.estado !== "conectada" || !appDeTienda(t.nombre)) continue;
    if (t.ultimaRevisionEn && ahora - Date.parse(t.ultimaRevisionEn) < REVISION_MS) continue;
    const limite = new Date(ahora - REVISION_MS).toISOString();
    const { data: tomada } = await supabase
      .from("tiendas")
      .update({ ultima_revision_en: new Date(ahora).toISOString() })
      .eq("id", t.id)
      .or(`ultima_revision_en.is.null,ultima_revision_en.lt.${limite}`)
      .select("id");
    if (!tomada?.length) continue;
    try {
      await revisarTienda(supabase, { id: t.id, nombre: t.nombre });
    } catch {
      // Si Shopify no responde, la próxima apertura vuelve a intentar; «Revisar ahora» en Tiendas muestra el error.
    }
  }
}
