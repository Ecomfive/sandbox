// Pedidos nuevos «En espera» (26 nov 2026, aviso de atención al cliente: «los pedidos aún no se marcan como en espera»). El manual ATC dice que al
// entrar el pedido queda «En espera» y con la etiqueta «por confirmar datos», y que despacho no lo prepara hasta que la asesora lo confirma (Confirmar en
// la ficha levanta la espera). Lo llama el aviso de Shopify de un pedido nuevo (`orders/create`), después de responderle a Shopify. Solo con la tienda
// conectada, con «Escribir en Shopify» y con «Pedidos nuevos en espera» encendidos (`tiendas.pone_en_espera`, migración 0369). Deja su línea en la
// cronología del pedido (Notas del equipo), también si no se pudo. Solo servidor; nunca lanza.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cambiarEtiquetasEnShopify, ponerEnEsperaEnShopify } from "./escribir-shopify";
import { ETIQUETA_POR_CONFIRMAR, entraEnEspera, porConfirmar } from "./gestion-atc";
import { appDeDominio } from "./shopify-app";

const AUTOR = "Sistema (pedido nuevo)";

export type ResultadoEspera = "nada" | "en_espera" | "error";

export async function ponerEnEsperaAlEntrar(supabase: SupabaseClient, d: { dominio: string; orden: Record<string, unknown>; origenClave: string | null }): Promise<ResultadoEspera> {
  try {
    const dominio = d.dominio.toLowerCase();
    const { data: tienda, error } = await supabase.from("tiendas").select("id, nombre, estado, escribe_shopify, pone_en_espera").eq("dominio", dominio).maybeSingle();
    // Sin la migración 0369 (`pone_en_espera`) o con la tienda apagada, nada.
    if (error || !tienda || tienda.estado !== "conectada" || !tienda.escribe_shopify || tienda.pone_en_espera !== true) return "nada";
    const numero = typeof d.orden.name === "string" ? d.orden.name : "";
    if (!numero || d.orden.cancelled_at || d.orden.fulfillment_status) return "nada";
    const etiquetas = String(d.orden.tags ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (!entraEnEspera(etiquetas)) return "nada";
    const app = appDeDominio(dominio);
    if (!app) return "nada";

    const nota = async (texto: string) => {
      if (!d.origenClave) return;
      const { data: o } = await supabase.from("ven_ordenes").select("id").eq("origen_clave", d.origenClave).maybeSingle();
      if (o) await supabase.from("ven_orden_notas").insert({ orden_id: o.id, texto, autor: AUTOR });
    };
    try {
      const puestas = await ponerEnEsperaEnShopify(app, numero);
      if (!porConfirmar(etiquetas)) {
        const r = await cambiarEtiquetasEnShopify(app, numero, [ETIQUETA_POR_CONFIRMAR], []);
        if (r.error) throw new Error(r.error);
      }
      await nota(puestas ? "Entró «En espera» y con «por confirmar datos»: despacho lo prepara cuando la asesora lo confirme." : "Entró con «por confirmar datos» (Shopify no tenía envíos abiertos para dejar en espera).");
      return "en_espera";
    } catch (e) {
      await nota(`No se pudo dejar en espera al entrar: ${e instanceof Error ? e.message : "Shopify no respondió."} Hay que confirmarlo o dejarlo en espera a mano.`.slice(0, 500));
      return "error";
    }
  } catch {
    return "error";
  }
}
