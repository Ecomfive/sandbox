// Lleva el costo puesto de las compras que ya llegaron a Costos de mercancía (mejoras 31 y 37). Lo usan «Usar como costo
// oficial» de Compras y costos y la tarea diaria de alertas. Lo calcula igual que la página (costo puesto + financiamiento
// por OC) y guarda un lote por compra y producto, sin duplicar (`origen_clave`). Sin permisos: los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarComprasCostos } from "./cargar-compras-costos";
import { normalizar } from "./clasificacion";
import { costoPuestoCompras } from "./compras-costos";
import { ORIGEN_COMPRAS, lotesDesdeCompras } from "./costos-desde-compras";
import { conFinanciamiento, financiamientoPorOrden } from "./financiamiento-orden";

export async function sincronizarCostosCompras(
  supabase: SupabaseClient,
  hoy: string,
  codigoPais?: string,
): Promise<{ error: string } | { lotes: number; quitados: number }> {
  const datos = await cargarComprasCostos(supabase, hoy, codigoPais);
  if ("error" in datos) return datos;
  const costoPuesto = costoPuestoCompras(datos.compras, datos.items, datos.gastos, datos.vigente, datos.nombres);
  const costos = conFinanciamiento(costoPuesto, financiamientoPorOrden(datos.movsGrupo, datos.tasas, new Map(costoPuesto.map((c) => [c.codigo, c.fob])), hoy));
  // La clave de un producto que ya tenía lotes (del Excel) se respeta: así su historial y su mapeo con Dropi siguen.
  const claveSku = new Map<string, string>();
  for (const l of datos.lotes) if (l.skuId && !claveSku.has(l.skuId)) claveSku.set(l.skuId, l.productoClave);
  const lotes = lotesDesdeCompras(costos, (sku, producto) => claveSku.get(sku) ?? normalizar(producto));
  const ahora = new Date().toISOString();
  for (let i = 0; i < lotes.length; i += 300) {
    const { error } = await supabase
      .from("fin_costos_lotes")
      .upsert(lotes.slice(i, i + 300).map((l) => ({ ...l, origen: ORIGEN_COMPRAS, actualizado_en: ahora })), { onConflict: "origen_clave" });
    if (error) return { error: `No se pudieron guardar los costos: ${error.message}` };
  }
  // Los lotes de estas compras que ya no corresponden (la compra volvió a abrirse o perdió un producto) se quitan.
  const vigentes = new Set(lotes.map((l) => l.origen_clave));
  const ids = datos.compras.map((c) => c.id);
  let quitados = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from("fin_costos_lotes")
      .select("id, origen_clave")
      .eq("origen", ORIGEN_COMPRAS)
      .or(ids.slice(i, i + 100).map((id) => `origen_clave.like.compra:${id}:%`).join(","));
    const sobran = (data ?? []).filter((d) => !vigentes.has(String(d.origen_clave))).map((d) => d.id as string);
    if (sobran.length) {
      const { error } = await supabase.from("fin_costos_lotes").delete().in("id", sobran);
      if (!error) quitados += sobran.length;
    }
  }
  return { lotes: lotes.length, quitados };
}
