import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";

/**
 * Los SKU maestros que se pueden elegir en una ficha de producto: todos, por código (son la identidad del producto), con su foto
 * para que la lista de sugerencias del buscador la muestre (23 oct 2026, pedido de Hernán).
 */
export async function obtenerOpcionesSkuMaestro(supabase: SupabaseClient): Promise<OpcionSkuMaestro[]> {
  const { data } = await traerTodasConError<Record<string, unknown>>((desde, hasta) =>
    supabase.from("skus_maestros").select("id, codigo, nombre, estado, foto_url, tipo").order("codigo").order("id").range(desde, hasta),
  );
  return (data ?? []).map((s) => ({ id: s.id as string, codigo: s.codigo as string, nombre: s.nombre as string, estado: s.estado as string, foto: (s.foto_url as string | null) ?? null, compuesto: s.tipo === "combo" }));
}
