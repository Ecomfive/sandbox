import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";

/** Los SKU maestros que se pueden elegir en una ficha de producto: todos, por código (son la identidad del producto). */
export async function obtenerOpcionesSkuMaestro(supabase: SupabaseClient): Promise<OpcionSkuMaestro[]> {
  const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre, estado").order("codigo").limit(5000);
  return (data ?? []).map((s) => ({ id: s.id as string, codigo: s.codigo as string, nombre: s.nombre as string, estado: s.estado as string }));
}
