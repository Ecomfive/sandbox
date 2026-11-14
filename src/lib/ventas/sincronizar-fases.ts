// Después de guardar las órdenes que llegaron de Shopify: les pone su fase del ciclo si no la tenían (entran «por
// confirmar», con la plata contra entrega esperada) y, si Shopify canceló o reembolsó una que seguía abierta, la cancela.

import type { SupabaseClient } from "@supabase/supabase-js";
import { FASES_ABIERTAS, faseInicial, ESTADO_DE_FASE } from "./ciclo";
import type { OrdenVenta } from "./matriz";

/** El día en Panamá (AAAA-MM-DD) de un momento. */
const diaPanama = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Panama" });

export async function sincronizarFases(supabase: SupabaseClient, ordenes: OrdenVenta[]): Promise<void> {
  for (let i = 0; i < ordenes.length; i += 100) {
    const tanda = ordenes.slice(i, i + 100);
    const consulta = (columnas: string) => supabase.from("ven_ordenes").select(columnas).in("origen_clave", tanda.map((o) => o.origen_clave)) as unknown as Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
    let { data, error } = await consulta("id, origen_clave, fase, despachada_en, fecha_envio");
    if (error && /despachada_en|fecha_envio/.test(error.message)) ({ data, error } = await consulta("id, origen_clave, fase"));
    if (error) {
      // Sin la migración 0956 el ciclo no existe todavía: la importación sigue como antes.
      if (/fase/.test(error.message)) return;
      throw new Error(`ven_ordenes: ${error.message}`);
    }
    const por = new Map(tanda.map((o) => [o.origen_clave, o]));
    for (const r of data ?? []) {
      const o = por.get(String(r.origen_clave));
      if (!o) continue;
      const fase = (r.fase as string | null) ?? null;
      const ini = faseInicial(o.estado_entrega, o.metodo_pago, o.total);
      if (fase === null) {
        const { error: e } = await supabase.from("ven_ordenes").update({ fase: ini.fase, cod_esperado: ini.codEsperado }).eq("id", r.id).is("fase", null);
        if (e) throw new Error(`ven_ordenes: ${e.message}`);
        await supabase.from("ven_orden_eventos").insert({ orden_id: r.id, tipo: "fase", fase_despues: ini.fase, detalle: "Llegó de Shopify", usuario: "Shopify" });
      } else if ((FASES_ABIERTAS as string[]).includes(fase) && ini.fase === "cancelada") {
        const { error: e } = await supabase.from("ven_ordenes").update({ fase: "cancelada", cod_esperado: null, estado_entrega: ESTADO_DE_FASE.cancelada }).eq("id", r.id).eq("fase", fase);
        if (e) throw new Error(`ven_ordenes: ${e.message}`);
        await supabase.from("ven_orden_eventos").insert({ orden_id: r.id, tipo: "fase", fase_antes: fase, fase_despues: "cancelada", detalle: "Cancelada o reembolsada en Shopify", usuario: "Shopify" });
      } else if ((fase === "por_confirmar" || fase === "confirmada") && ini.fase === "despachada") {
        // Preparada en Shopify después de entrar (14 nov 2026): antes se quedaba «por confirmar» aunque ya hubiera salido.
        const cuando = o.despachada_en ?? new Date().toISOString();
        const { data: h, error: e } = await supabase
          .from("ven_ordenes")
          .update({ fase: "despachada", estado_entrega: ESTADO_DE_FASE.despachada, despachada_en: cuando, fecha_envio: diaPanama(cuando) })
          .eq("id", r.id)
          .eq("fase", fase)
          .select("id");
        if (e) throw new Error(`ven_ordenes: ${e.message}`);
        if (h?.length) await supabase.from("ven_orden_eventos").insert({ orden_id: r.id, tipo: "fase", fase_antes: fase, fase_despues: "despachada", detalle: "Preparada en Shopify", usuario: "Shopify" });
        continue;
      }
      // La fecha de despacho de Shopify (el primer «fulfillment»), si la orden todavía no la tiene (14 nov 2026).
      const conFecha = r as { despachada_en?: string | null; fecha_envio?: string | null };
      if (o.despachada_en && "despachada_en" in conFecha && !conFecha.despachada_en && (fase === null ? ini.fase : fase) !== "por_confirmar") {
        const cambio: Record<string, unknown> = { despachada_en: o.despachada_en };
        if (!conFecha.fecha_envio) cambio.fecha_envio = diaPanama(o.despachada_en);
        const { error: e } = await supabase.from("ven_ordenes").update(cambio).eq("id", r.id).is("despachada_en", null);
        if (e) throw new Error(`ven_ordenes: ${e.message}`);
      }
    }
  }
}
