import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { loQueVende, productosDeCartera, recomendados, type CaminoProducto, type LoQueVende, type ProductoCartera, type Recomendado, type StockProducto, type VentaProducto } from "@/lib/crm/productos";
import { cargarEnCamino } from "@/lib/publicaciones/en-camino-datos";
import { idsDeDropi } from "@/lib/publicaciones/sincronizar-dropi";
import { cargarResumenVentas } from "@/lib/publicaciones/ventas-datos";
import { traerTodasConError, traerTodasLasFilas } from "@/lib/supabase/paginar";

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
 * Lo que vende la cartera en el país (pedidos de 30 días por producto y dropshipper, migraciones 0198 y 0201) con el stock y el ritmo de venta de
 * cada producto (Desempeño › Ventas Dropi) y lo que viene en camino (Compras, por el producto del sistema vinculado en Gestión de IDs).
 * `ids`: los dropshippers del panel (para armar lo de cada uno). Sin esas migraciones devuelve el error para avisarlo.
 */
export async function cargarProductos(supabase: SupabaseClient, paisId: string, usuario: UsuarioActual, ids: string[]): Promise<DatosProductos | { error: string }> {
  const [ventasR, resumen, pubs, camino] = await Promise.all([
    // Por páginas: la base devuelve hasta 1 000 filas por consulta y son una por dropshipper y producto.
    traerTodasConError<{ dropshipper_id: string; producto_id: number; producto: string | null; pedidos: number }>((d, h) =>
      supabase.rpc("crm_productos_por_dropshipper", { p_pais: paisId, p_dias: 30 }).order("dropshipper_id").order("producto_id").range(d, h),
    ),
    cargarResumenVentas(supabase, paisId),
    traerTodasLasFilas<{ dropi_id: string | null; sku_maestro_id: string | null }>((d, h) =>
      supabase.from("dropi_publicaciones").select("dropi_id, sku_maestro_id").eq("pais_id", paisId).not("sku_maestro_id", "is", null).order("id").range(d, h),
    ),
    cargarEnCamino(supabase, paisId, usuario).catch(() => ({ camino: new Map() })),
  ]);
  if (ventasR.error) return { error: "Falta correr la migración 0201 (productos de cada dropshipper) en la base." };
  // Sin la 0198 (el ID de Dropi de cada línea del pedido) la función no encuentra nada: se avisa en vez de mostrar la vista vacía.
  if (!(ventasR.data ?? []).length) {
    const { data: conId } = await supabase.from("crm_ordenes_items").select("orden_id").not("producto_id", "is", null).limit(1);
    if (!conId?.length) return { error: "Falta correr la migración 0198 (el ID de Dropi de cada producto de los pedidos) en la base." };
  }

  const ventas: VentaProducto[] = (ventasR.data ?? []).map((v) => ({
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
