// Después de guardar las órdenes que llegaron de Shopify: les pone su fase del ciclo si no la tenían (entran «por
// confirmar», con la plata contra entrega esperada) y, si Shopify canceló o reembolsó una que seguía abierta, la cancela.

import type { SupabaseClient } from "@supabase/supabase-js";
import { FASES_ABIERTAS, faseInicial, ESTADO_DE_FASE } from "./ciclo";
import type { OrdenVenta } from "./matriz";

export async function sincronizarFases(supabase: SupabaseClient, ordenes: OrdenVenta[]): Promise<void> {
  for (let i = 0; i < ordenes.length; i += 100) {
    const tanda = ordenes.slice(i, i + 100);
    const { data, error } = await supabase.from("ven_ordenes").select("id, origen_clave, fase").in("origen_clave", tanda.map((o) => o.origen_clave));
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
      }
    }
  }
}
