// Automatización interna (16 nov 2026, pedido de Hernán, no tiene pantalla): cuando el bot de iComfly crea un pedido en Shopify deja una nota («Pedido #… - Venta por bot - WhatsApp +…») que estorba
// los tickets de Despacho. El webhook de Shopify (`orders/create` y `orders/updated`) llama aquí con la orden: si trae esa nota, se anota en `tienda_notas_bot` (con el texto original, por si hay que
// recuperarlo) y, solo con la escritura encendida, se quita de Shopify. Hoy la app de Shopify es de solo lectura: mientras no tenga el permiso `write_orders` y la tienda no tenga
// `quitar_nota_bot = true`, solo detecta y registra lo que borraría. Solo servidor; nunca lanza (el aviso de Shopify ya se guardó).

import type { SupabaseClient } from "@supabase/supabase-js";
import { quitarNotaDelBot } from "./nota-bot";
import { accesoDeApp, appDeDominio } from "./shopify-app";

const VERSION_API = "2026-07";

export type ResultadoNotaBot = "nada" | "detectada" | "borrada" | "error";

/** Quita la nota de la orden en Shopify (`orderUpdate`) y devuelve el error en palabras, o null si quedó. */
async function ponerNota(dominio: string, token: string, gid: string, nota: string): Promise<string | null> {
  const r = await fetch(`https://${dominio}/admin/api/${VERSION_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token, Accept: "application/json" },
    body: JSON.stringify({
      query: "mutation($input: OrderInput!) { orderUpdate(input: $input) { order { id note } userErrors { field message } } }",
      variables: { input: { id: gid, note: nota } },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status === 401 || r.status === 403) return `Shopify rechazó el cambio (${r.status}).`;
  if (!r.ok) return `Shopify respondió ${r.status}.`;
  const cuerpo = (await r.json()) as { data?: { orderUpdate?: { order?: { note?: string | null } | null; userErrors?: { message: string }[] } }; errors?: { message: string }[] };
  const errores = [...(cuerpo.errors ?? []).map((e) => e.message), ...(cuerpo.data?.orderUpdate?.userErrors ?? []).map((e) => e.message)];
  if (errores.length) return errores.join("; ").slice(0, 300);
  return (cuerpo.data?.orderUpdate?.order?.note ?? "").trim() === nota.trim() ? null : "Shopify no dejó la nota como se pidió.";
}

export async function procesarNotaDelBot(supabase: SupabaseClient, d: { dominio: string; orden: Record<string, unknown> }): Promise<ResultadoNotaBot> {
  try {
    const nota = typeof d.orden.note === "string" ? d.orden.note : "";
    const r = quitarNotaDelBot(nota);
    if (!r.coincide) return "nada";
    const ordenId = String(d.orden.id ?? "").trim();
    if (!/^\d+$/.test(ordenId)) return "nada";
    const gid = typeof d.orden.admin_graphql_api_id === "string" && d.orden.admin_graphql_api_id.startsWith("gid://shopify/Order/") ? d.orden.admin_graphql_api_id : `gid://shopify/Order/${ordenId}`;
    const dominio = d.dominio.toLowerCase();

    // El registro: uno por pedido; si ya se borró, no se vuelve a hacer nada.
    const { data: tienda } = await supabase.from("tiendas").select("id, quitar_nota_bot").eq("dominio", dominio).maybeSingle();
    await supabase
      .from("tienda_notas_bot")
      .upsert(
        { dominio, shopify_orden_id: ordenId, tienda_id: (tienda?.id as string | undefined) ?? null, numero: typeof d.orden.name === "string" ? d.orden.name.slice(0, 40) : null, nota_original: nota.slice(0, 2000), nota_nueva: r.notaNueva.slice(0, 2000) },
        { onConflict: "dominio,shopify_orden_id", ignoreDuplicates: true },
      );
    const { data: previo } = await supabase.from("tienda_notas_bot").select("estado").eq("dominio", dominio).eq("shopify_orden_id", ordenId).maybeSingle();
    if (previo?.estado === "borrada") return "borrada";

    // Solo se escribe en Shopify con la tienda encendida (`quitar_nota_bot`); si no, queda registrado lo que se borraría.
    if (tienda?.quitar_nota_bot !== true) return "detectada";
    const marcar = (estado: "borrada" | "error" | "detectada", error: string | null) =>
      supabase.from("tienda_notas_bot").update({ estado, error, actualizado_en: new Date().toISOString() }).eq("dominio", dominio).eq("shopify_orden_id", ordenId);
    const app = appDeDominio(dominio);
    if (!app) {
      await marcar("error", "La tienda no tiene su app de Shopify configurada.");
      return "error";
    }
    const acceso = await accesoDeApp(app);
    if (!acceso.scope.split(",").map((s) => s.trim()).includes("write_orders")) {
      await marcar("detectada", "Falta el permiso write_orders de la app de Shopify.");
      return "detectada";
    }
    const falla = await ponerNota(dominio, acceso.token, gid, r.notaNueva);
    await marcar(falla ? "error" : "borrada", falla);
    return falla ? "error" : "borrada";
  } catch {
    return "error";
  }
}

// ── Pedidos que ya estaban sin preparar (21 nov 2026, pedido de Hernán: comprobar que de verdad se quita) ──
// El webhook solo atiende pedidos nuevos o que se actualizan. Para quitar la nota del bot a los pedidos que ya estaban en Shopify y **todavía no se han preparado** (los ya preparados no importan),
// se leen los pedidos abiertos sin preparar de la tienda y a cada uno que trae la línea del bot se le aplica el mismo camino del webhook (`procesarNotaDelBot`: registra la nota original y la quita).

export interface ResultadoLoteNotas {
  /** Pedidos sin preparar que traen la línea del bot (de los que se leyeron). */
  encontrados: number;
  quitadas: number;
  conError: number;
  /** Quedaron sin tocar (falta el permiso write_orders o la tienda no tiene «Quitar la nota del bot» encendido). */
  sinTocar: number;
  /** Hay más de los que caben en esta pasada: se vuelve a pulsar. */
  hayMas: boolean;
  error?: string;
}

interface PedidoSinPreparar {
  id: string;
  gid: string;
  name: string;
  note: string;
}

/** Pedidos abiertos y sin preparar con nota, de los más nuevos a los más viejos (hasta `paginas` de 100). */
async function pedidosSinPreparar(dominio: string, token: string, paginas = 4): Promise<PedidoSinPreparar[]> {
  const salida: PedidoSinPreparar[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < paginas; i++) {
    const r: Response = await fetch(`https://${dominio}/admin/api/${VERSION_API}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token, Accept: "application/json" },
      body: JSON.stringify({
        query:
          'query($after: String) { orders(first: 100, after: $after, sortKey: CREATED_AT, reverse: true, query: "fulfillment_status:unfulfilled status:open") { pageInfo { hasNextPage endCursor } nodes { id legacyResourceId name note displayFulfillmentStatus } } }',
        variables: { after: cursor },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) throw new Error(`Shopify respondió ${r.status}.`);
    const cuerpo = (await r.json()) as {
      data?: { orders?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { id: string; legacyResourceId: string; name: string; note: string | null; displayFulfillmentStatus: string }[] } };
      errors?: { message: string }[];
    };
    if (cuerpo.errors?.length) throw new Error(cuerpo.errors.map((e) => e.message).join("; ").slice(0, 300));
    const pagina = cuerpo.data?.orders;
    if (!pagina) break;
    for (const n of pagina.nodes) if (n.displayFulfillmentStatus === "UNFULFILLED" && n.note) salida.push({ id: String(n.legacyResourceId), gid: n.id, name: n.name, note: n.note });
    if (!pagina.pageInfo.hasNextPage) break;
    cursor = pagina.pageInfo.endCursor;
  }
  return salida;
}

/** Quita la nota del bot de hasta `max` pedidos sin preparar de la tienda. Nunca escribe si la tienda no tiene «Quitar la nota del bot» encendido (lo comprueba `procesarNotaDelBot`). */
export async function quitarNotasDeSinPreparar(supabase: SupabaseClient, dominio: string, max = 25): Promise<ResultadoLoteNotas> {
  const vacio: ResultadoLoteNotas = { encontrados: 0, quitadas: 0, conError: 0, sinTocar: 0, hayMas: false };
  const app = appDeDominio(dominio);
  if (!app) return { ...vacio, error: "La tienda no tiene su app de Shopify configurada." };
  try {
    const acceso = await accesoDeApp(app);
    const conNota = (await pedidosSinPreparar(dominio, acceso.token)).filter((p) => quitarNotaDelBot(p.note).coincide);
    const lote = conNota.slice(0, max);
    const r: ResultadoLoteNotas = { ...vacio, encontrados: conNota.length, hayMas: conNota.length > lote.length };
    // De a cuatro a la vez: cada cambio es una llamada a Shopify.
    for (let i = 0; i < lote.length; i += 4) {
      const resultados = await Promise.all(lote.slice(i, i + 4).map((p) => procesarNotaDelBot(supabase, { dominio, orden: { id: p.id, admin_graphql_api_id: p.gid, name: p.name, note: p.note } })));
      for (const x of resultados) {
        if (x === "borrada") r.quitadas++;
        else if (x === "error") r.conError++;
        else r.sinTocar++;
      }
    }
    return r;
  } catch (e) {
    return { ...vacio, error: e instanceof Error ? e.message : "No se pudo leer los pedidos de Shopify." };
  }
}
