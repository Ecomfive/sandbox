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

/**
 * Una tienda que se conecta a iComfly por primera vez ya tiene el bot que deja la nota en los pedidos: se le enciende «Quitar la nota del bot» sola (21 nov 2026, pedido de Hernán, después de que en Oferfy y
 * Nuvo se quitó a 8 de 8 pedidos). Solo la primera vez: si un administrador la apaga a propósito y después se vuelve a autorizar iComfly, no se vuelve a encender. Mientras la app de Shopify no tenga el
 * permiso `write_orders`, el pedido solo se detecta y se registra (`procesarNotaDelBot`). Nunca lanza.
 */
export async function encenderQuitarNotaAlConectarIcomfly(supabase: SupabaseClient, tiendaId: string, yaEstabaConectada: boolean): Promise<boolean> {
  if (yaEstabaConectada) return false;
  try {
    const { error } = await supabase.from("tiendas").update({ quitar_nota_bot: true }).eq("id", tiendaId);
    return !error;
  } catch {
    return false;
  }
}
