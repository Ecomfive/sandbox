// Tarea «shopify-ventas» (mejora 98): lee las órdenes (con sus reembolsos) de cada tienda de `SHOPIFY_TIENDAS` por la
// Admin API desde la última leída (`fin_shopify_estado.cursor`, migración 0937) y las guarda en `ven_ordenes` /
// `ven_orden_lineas` con la misma huella que el importador del Excel:
// - una orden nueva, o que ya había venido de Shopify, se guarda completa (`guardarLoteOrdenes`, origen 'shopify');
// - una orden que ya vino del Excel **no se pisa**: solo se actualiza su estado de pago y, si se canceló o se reembolsó
//   entera, su estado de entrega (lo demás —repartidor, costo de envío, guía— lo lleva el Excel o el reparto).
// Sin tiendas configuradas la tarea queda apagada.

import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarLoteOrdenes } from "../ventas/guardar";
import type { OrdenVenta } from "../ventas/matriz";
import { leerTiendasShopify, ordenDeShopify, siguientePagina, type TiendaShopify } from "./shopify";
import { leerConexiones } from "../ventas/conexion-tienda";
import { sincronizarFases } from "../ventas/sincronizar-fases";
import { appsDeEntorno, tokenDeApp } from "../tienda/shopify-app";
import { completarTelefonosDeOrdenes } from "../tienda/telefono-cliente";

const VERSION_API = "2024-10";
const CAMPOS = "name,created_at,updated_at,cancelled_at,cancel_reason,financial_status,fulfillment_status,total_price,subtotal_price,total_discounts,total_shipping_price_set,line_items,refunds,payment_gateway_names,gateway,tags,note,phone,shipping_address,billing_address";

export const shopifyConfigurado = () => leerTiendasShopify(process.env.SHOPIFY_TIENDAS).length > 0;

/** Las tiendas de la variable de entorno y las conectadas desde el portal (la del portal manda si es la misma tienda). */
export async function tiendasConfiguradas(supabase: SupabaseClient): Promise<TiendaShopify[]> {
  const delPortal = await leerConexiones(supabase);
  const nombres = new Set(delPortal.map((t) => t.tienda.toUpperCase()));
  // Las tiendas conectadas con su app del Dev Dashboard (Gestión de tienda, 12 nov 2026): su token se pide al momento y dura 24 horas.
  const deApps: TiendaShopify[] = [];
  for (const app of appsDeEntorno()) {
    if (nombres.has(app.tienda.toUpperCase())) continue;
    try {
      deApps.push({ tienda: app.tienda, dominio: app.dominio, token: await tokenDeApp(app) });
      nombres.add(app.tienda.toUpperCase());
    } catch {
      // Sin acceso (app desinstalada, secreto cambiado): esa tienda no se lee; la pantalla Tiendas lo muestra al revisarla.
    }
  }
  return [...delPortal, ...deApps, ...leerTiendasShopify(process.env.SHOPIFY_TIENDAS).filter((t) => !nombres.has(t.tienda.toUpperCase()))];
}

export async function guardarOrdenesShopify(supabase: SupabaseClient, ordenes: OrdenVenta[]): Promise<{ nuevas: number; actualizadas: number; soloEstado: number }> {
  if (!ordenes.length) return { nuevas: 0, actualizadas: 0, soloEstado: 0 };
  const origenes = new Map<string, string>();
  const claves = ordenes.map((o) => o.origen_clave);
  for (let i = 0; i < claves.length; i += 100) {
    const { data, error } = await supabase.from("ven_ordenes").select("origen_clave, origen").in("origen_clave", claves.slice(i, i + 100));
    if (error) throw new Error(`ven_ordenes: ${error.message}`);
    for (const r of data ?? []) origenes.set(r.origen_clave as string, r.origen as string);
  }
  const completas = ordenes.filter((o) => !origenes.has(o.origen_clave) || origenes.get(o.origen_clave) === "shopify");
  const deExcel = ordenes.filter((o) => origenes.has(o.origen_clave) && origenes.get(o.origen_clave) !== "shopify");
  const r = await guardarLoteOrdenes(supabase, "shopify", completas);
  await sincronizarFases(supabase, ordenes);
  for (const o of deExcel) {
    const cambio: Record<string, unknown> = { estado_pago: o.estado_pago, actualizado_en: new Date().toISOString() };
    if (o.estado_entrega === "cancelada" || o.estado_entrega === "devuelta") cambio.estado_entrega = o.estado_entrega;
    const { error } = await supabase.from("ven_ordenes").update(cambio).eq("origen_clave", o.origen_clave);
    if (error) throw new Error(`ven_ordenes: ${error.message}`);
  }
  // El teléfono normalizado de cada cliente, para juntar sus pedidos (Gestión de tienda, 12 nov 2026). No falla nunca.
  await completarTelefonosDeOrdenes(supabase, ordenes.map((o) => o.origen_clave));
  return { nuevas: r.nuevas, actualizadas: r.actualizadas, soloEstado: deExcel.length };
}

/** Lee y guarda una tienda hasta que se acaban las órdenes o el tiempo (`limite`, ms). */
export async function sincronizarTienda(supabase: SupabaseClient, t: TiendaShopify, limite: number, desdeForzado?: string): Promise<{ texto: string; completa: boolean }> {
  const { data: estado } = await supabase.from("fin_shopify_estado").select("cursor, ordenes").eq("tienda", t.tienda).maybeSingle();
  // Primera vez: los últimos 60 días (lo anterior ya vino por Excel).
  const desde = desdeForzado ?? (estado?.cursor as string | null) ?? new Date(Date.now() - 60 * 86_400_000).toISOString();
  let url: string | null =
    `https://${t.dominio}/admin/api/${VERSION_API}/orders.json?status=any&limit=250&order=updated_at+asc&updated_at_min=${encodeURIComponent(desde)}&fields=${CAMPOS}`;
  // Rellenar huecos relee hacia atrás pero nunca atrasa el cursor de la lectura normal.
  let cursor = desdeForzado && estado?.cursor && (estado.cursor as string) > desde ? (estado.cursor as string) : desde;
  let leidas = 0;
  const totales = { nuevas: 0, actualizadas: 0, soloEstado: 0 };
  while (url && Date.now() < limite) {
    const r: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": t.token, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (r.status === 401 || r.status === 403) throw new Error(`${t.tienda}: Shopify rechazó el token (${r.status}).`);
    if (!r.ok) throw new Error(`${t.tienda}: Shopify respondió ${r.status}.`);
    const cuerpo = (await r.json()) as { orders?: Record<string, unknown>[] };
    const crudas = cuerpo.orders ?? [];
    const ordenes = crudas.map((o) => ordenDeShopify(t.tienda, o)).filter((o): o is OrdenVenta => o !== null);
    const g = await guardarOrdenesShopify(supabase, ordenes);
    totales.nuevas += g.nuevas;
    totales.actualizadas += g.actualizadas;
    totales.soloEstado += g.soloEstado;
    leidas += crudas.length;
    const ultima = crudas.map((o) => String(o.updated_at ?? "")).filter(Boolean).sort().at(-1);
    if (ultima && ultima > cursor) cursor = ultima;
    url = siguientePagina(r.headers.get("link"));
  }
  await supabase
    .from("fin_shopify_estado")
    .upsert({ tienda: t.tienda, cursor, ordenes: Number(estado?.ordenes ?? 0) + totales.nuevas, actualizado_en: new Date().toISOString() }, { onConflict: "tienda" });
  return {
    texto: `${t.tienda}: ${leidas} leídas, ${totales.nuevas} nuevas, ${totales.actualizadas} actualizadas, ${totales.soloEstado} del Excel con su estado al día`,
    completa: url === null,
  };
}

export async function sincronizarShopify(supabase: SupabaseClient, limite: number): Promise<{ resumen: string; pendiente: boolean }> {
  const tiendas = await tiendasConfiguradas(supabase);
  if (!tiendas.length) return { resumen: "Apagada: conecta una tienda en Ventas por tienda › Pipeline (o define SHOPIFY_TIENDAS).", pendiente: false };
  const prueba = await supabase.from("fin_shopify_estado").select("tienda", { head: true, count: "exact" });
  if (prueba.error) throw new Error("Falta correr la migración 0937 (reportes y comunicación) en Supabase.");
  const partes: string[] = [];
  let pendiente = false;
  for (const t of tiendas) {
    if (Date.now() >= limite) {
      pendiente = true;
      break;
    }
    try {
      const r = await sincronizarTienda(supabase, t, limite);
      partes.push(r.texto);
      await supabase.from("ven_tiendas_conexion").update({ ultima_lectura: new Date().toISOString(), ultimo_error: null }).eq("activo", true).in("unidad_id", [(t as TiendaShopify & { unidadId?: string }).unidadId ?? ""]);
      if (!r.completa) pendiente = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${t.tienda}: falló.`;
      partes.push(msg);
      await supabase.from("ven_tiendas_conexion").update({ ultimo_error: msg.slice(0, 300) }).in("unidad_id", [(t as TiendaShopify & { unidadId?: string }).unidadId ?? ""]);
    }
  }
  return { resumen: partes.join(" · ") + (pendiente ? " · Sigue en la próxima ejecución." : ""), pendiente };
}
