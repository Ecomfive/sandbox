// Lo que las acciones de Inventario leen de la base para aplicar los permisos y el límite de existencia (`src/lib/permisos/inventario.ts`). Solo se usa en el servidor.
import type { createServiceClient } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof createServiceClient>;

export interface BodegaDeInventario {
  nombre: string;
  codigo: string;
  tipo: string;
  paisId: string;
  /** El código del país («PA»). */
  pais: string | null;
  nombrePais: string | null;
}

const uno = <T,>(r: T | T[] | null | undefined): T | null => (Array.isArray(r) ? (r[0] ?? null) : (r ?? null));

/** Una bodega con su país, o `null` si no existe. */
export async function leerBodega(supabase: Supabase, bodegaId: string): Promise<BodegaDeInventario | null> {
  const { data } = await supabase.from("wms_bodegas").select("nombre, codigo, tipo, pais_id, paises(nombre, codigo)").eq("id", bodegaId).maybeSingle();
  if (!data) return null;
  const p = uno(data.paises as { nombre: string; codigo: string } | { nombre: string; codigo: string }[] | null);
  return { nombre: data.nombre as string, codigo: data.codigo as string, tipo: data.tipo as string, paisId: data.pais_id as string, pais: p?.codigo ?? null, nombrePais: p?.nombre ?? null };
}

/**
 * La existencia de cada producto en un país: la suma del físico en sus bodegas propias. `null` si no se pudo leer (la acción no debe guardar sin comprobarlo).
 * Se pide por tandas para no pasar el tope de filas de la base.
 */
export async function existenciasEnPais(supabase: Supabase, skuIds: string[], paisId: string): Promise<Map<string, number> | null> {
  const total = new Map<string, number>(skuIds.map((id) => [id, 0]));
  for (let i = 0; i < skuIds.length; i += 100) {
    const { data, error } = await supabase
      .from("wms_stock")
      .select("sku_maestro_id, fisico, wms_bodegas!inner(pais_id, tipo)")
      .in("sku_maestro_id", skuIds.slice(i, i + 100))
      .eq("wms_bodegas.pais_id", paisId)
      .eq("wms_bodegas.tipo", "propia");
    if (error) return null;
    for (const f of data ?? []) total.set(f.sku_maestro_id as string, (total.get(f.sku_maestro_id as string) ?? 0) + Number(f.fisico));
  }
  return total;
}

export const NO_SE_PUDO_COMPROBAR = "No se pudo comprobar la existencia del producto. Intenta de nuevo.";
