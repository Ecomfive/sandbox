import type { SupabaseClient } from "@supabase/supabase-js";
import { precioEquivalente } from "@/lib/competencia/analisis";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";

export interface CompetidorBarato {
  proveedor: string;
  /** Su precio llevado al tamaño del nuestro (`precioEquivalente`). */
  precio: number;
}

/**
 * Los competidores de cada producto nuestro en Dropi (Análisis de competencia, migración 0108), por el ID de Dropi de nuestro
 * producto: los que lo venden igual (por nombre o foto), siguen publicados y tienen stock. Sin la tabla o sin búsquedas, vacío.
 */
export async function cargarCompetidores(supabase: SupabaseClient, paisId: string): Promise<Map<number, { nombre: string; proveedor: string; precio: number | null }[]>> {
  const out = new Map<number, { nombre: string; proveedor: string; precio: number | null }[]>();
  try {
    const [nuestros, otros] = await Promise.all([
      traerTodasLasFilas<{ id: string; dropi_producto_id: number }>((d, h) => supabase.from("competencia_productos").select("id, dropi_producto_id").eq("pais_id", paisId).eq("es_nuestro", true).order("id").range(d, h)),
      traerTodasLasFilas<{ igual_a: string; nombre: string; proveedor_nombre: string; precio: number | null }>((d, h) =>
        supabase
          .from("competencia_productos")
          .select("igual_a, nombre, proveedor_nombre, precio")
          .eq("pais_id", paisId)
          .eq("es_nuestro", false)
          .eq("estado", "activo")
          .gt("stock", 0)
          .not("igual_a", "is", null)
          .order("id")
          .range(d, h),
      ),
    ]);
    const dropiDe = new Map(nuestros.map((n) => [n.id, Number(n.dropi_producto_id)]));
    for (const o of otros) {
      const dropiId = dropiDe.get(o.igual_a);
      if (dropiId === undefined) continue;
      out.set(dropiId, [...(out.get(dropiId) ?? []), { nombre: o.nombre, proveedor: o.proveedor_nombre, precio: o.precio === null ? null : Number(o.precio) }]);
    }
  } catch {
    // Sin la migración 0108: sin competencia.
  }
  return out;
}

/** El competidor más barato que nosotros (a precio equivalente), o null si nadie vende lo mismo más barato. */
export function competidorMasBarato(
  nuestro: { nombre: string; precio: number | null; idsDropi: number[] },
  competidores: Map<number, { nombre: string; proveedor: string; precio: number | null }[]>,
): CompetidorBarato | null {
  if (nuestro.precio === null) return null;
  let mejor: CompetidorBarato | null = null;
  for (const id of nuestro.idsDropi)
    for (const c of competidores.get(id) ?? []) {
      const eq = precioEquivalente(nuestro.nombre, c).precio;
      if (eq !== null && eq < nuestro.precio && (!mejor || eq < mejor.precio)) mejor = { proveedor: c.proveedor, precio: eq };
    }
  return mejor;
}
