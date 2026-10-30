import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { loQueVende, productosDeCartera, recomendados, type CaminoProducto, type LoQueVende, type ProductoCartera, type Recomendado, type StockProducto, type VentaProducto } from "@/lib/crm/productos";
import { cargarEnCamino } from "@/lib/publicaciones/en-camino-datos";
import { idsDeDropi } from "@/lib/publicaciones/sincronizar-dropi";
import { cargarResumenVentas } from "@/lib/publicaciones/ventas-datos";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";

export interface DatosProductos {
  productos: ProductoCartera[];
  /** Por dropshipper: lo que vende (sus 5 más pedidos) y qué recomendarle (3). */
  porCliente: Record<string, { vende: LoQueVende[]; recomendados: Recomendado[] }>;
  /** Cuándo se leyó el stock de Dropi (ISO); null si viene de la carga de ventas o no hay. */
  stockLeidoEn: string | null;
  /** No hay ventas de Dropi cargadas para el país: sin stock ni ritmo de venta. */
  sinStock: boolean;
}

/**
 * Lo que vende la cartera en el país (pedidos de 30 días por producto y dropshipper, migración 0200) con el stock y el ritmo de venta de
 * cada producto (Desempeño › Ventas Dropi) y lo que viene en camino (Compras, por el producto del sistema vinculado en Gestión de IDs).
 * `ids`: los dropshippers del panel (para armar lo de cada uno). Sin la migración 0200 devuelve el error para avisarlo.
 */
export async function cargarProductos(supabase: SupabaseClient, paisId: string, usuario: UsuarioActual, ids: string[]): Promise<DatosProductos | { error: string }> {
  const [ventasR, resumen, pubs, camino] = await Promise.all([
    supabase.rpc("crm_productos_por_dropshipper", { p_pais: paisId, p_dias: 30 }),
    cargarResumenVentas(supabase, paisId),
    traerTodasLasFilas<{ dropi_id: string | null; sku_maestro_id: string | null }>((d, h) =>
      supabase.from("dropi_publicaciones").select("dropi_id, sku_maestro_id").eq("pais_id", paisId).not("sku_maestro_id", "is", null).order("id").range(d, h),
    ),
    cargarEnCamino(supabase, paisId, usuario).catch(() => ({ camino: new Map() })),
  ]);
  if (ventasR.error) return { error: "Falta correr la migración 0200 (productos de cada dropshipper) en la base." };

  const ventas: VentaProducto[] = ((ventasR.data ?? []) as { dropshipper_id: string; producto_id: number; producto: string | null; pedidos: number }[]).map((v) => ({
    dropshipperId: v.dropshipper_id,
    productoId: Number(v.producto_id),
    producto: v.producto ?? `Producto ${v.producto_id}`,
    pedidos: Number(v.pedidos),
  }));
  const stock = new Map<number, StockProducto>();
  for (const [id, r] of resumen?.resumen ?? []) stock.set(id, { stock: r.stock, porDia: r.porDia, diasInventario: r.diasInventario });
  // Lo que viene en camino es por producto del sistema: se lleva a cada ID de Dropi vinculado a él.
  const caminoPorId = new Map<number, CaminoProducto>();
  for (const p of pubs) {
    const c = p.sku_maestro_id ? camino.camino.get(p.sku_maestro_id) : undefined;
    if (!c || c.unidades <= 0) continue;
    for (const id of idsDeDropi(p.dropi_id)) caminoPorId.set(id, { unidades: c.unidades, llegada: c.llegada });
  }

  const productos = productosDeCartera(ventas, stock, caminoPorId);
  const porCliente: DatosProductos["porCliente"] = {};
  for (const id of ids) {
    const vende = loQueVende(id, productos);
    porCliente[id] = { vende, recomendados: recomendados(id, productos) };
  }
  return { productos, porCliente, stockLeidoEn: resumen?.stockLeidoEn ?? null, sinStock: !resumen };
}
