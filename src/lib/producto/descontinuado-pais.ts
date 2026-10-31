import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Descontinuado por país (31 oct 2026, pedido de Hernán; migración 0211): los países donde un producto ya no se trae, aunque en los demás siga
 * Activo. «Descontinuado» en el estado del producto vale para todos. Sin la migración, ningún producto está descontinuado en un país.
 */

/** Por producto, los ids de los países donde está descontinuado. */
export async function descontinuadosPorPais(supabase: SupabaseClient, skuIds: string[]): Promise<Map<string, Set<string>>> {
  const porSku = new Map<string, Set<string>>();
  for (let i = 0; i < skuIds.length; i += 200) {
    const { data, error } = await supabase.from("skus_descontinuado_pais").select("sku_id, pais_id").in("sku_id", skuIds.slice(i, i + 200));
    if (error) return porSku;
    for (const f of data ?? []) {
      const set = porSku.get(f.sku_id as string) ?? new Set<string>();
      set.add(f.pais_id as string);
      porSku.set(f.sku_id as string, set);
    }
  }
  return porSku;
}

/** Los productos descontinuados en un país (para marcar la lista de ese país). */
export async function descontinuadosEnPais(supabase: SupabaseClient, paisId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("skus_descontinuado_pais").select("sku_id").eq("pais_id", paisId);
  return new Set(error ? [] : (data ?? []).map((f) => f.sku_id as string));
}

/** Si el producto está descontinuado en ese país, el nombre del país; si no, null. */
export async function descontinuadoEn(supabase: SupabaseClient, skuId: string, paisId: string | null): Promise<string | null> {
  if (!paisId) return null;
  const { data, error } = await supabase.from("skus_descontinuado_pais").select("paises(nombre)").eq("sku_id", skuId).eq("pais_id", paisId).maybeSingle();
  if (error || !data) return null;
  const pais = data.paises as { nombre: string } | { nombre: string }[] | null;
  return (Array.isArray(pais) ? pais[0]?.nombre : pais?.nombre) ?? "este país";
}
