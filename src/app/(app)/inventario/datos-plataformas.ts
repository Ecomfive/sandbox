import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { armarStockPlataformas, type LecturasPlataformas, type ProductoDropi, type PublicacionDrop, type PublicacionDropi, type PublicacionDunamixfy, type PublicacionEffi, type StockPlataformas, type VinculoVariacion } from "@/lib/wms/stock-plataformas";

/** Los países donde Inventario muestra el stock de las plataformas. Por ahora solo Costa Rica, que trabaja con plataformas y no tiene tiendas. */

/** Lee lo último que se sabe de Dropi, Effi y Drop en el país y lo junta por producto. Si una lectura falla, esa plataforma no se muestra y el inventario carga igual. */
export async function leerStockPlataformas(
  supabase: SupabaseClient,
  paisId: string,
): Promise<{ porProducto: Map<string, StockPlataformas>; lecturas: LecturasPlataformas; fallaron: boolean }> {
  const [dropi, productosDropi, effi, drop, vinculos, dunamixfy] = await Promise.all([
    traerTodasConError<PublicacionDropi>((d, h) =>
      supabase.from("dropi_publicaciones").select("sku_maestro_id, dropi_id, nombre, estado_publicacion").eq("pais_id", paisId).not("sku_maestro_id", "is", null).not("dropi_id", "is", null).order("id").range(d, h),
    ),
    traerTodasConError<ProductoDropi>((d, h) => supabase.from("dropi_productos_proveedor").select("dropi_producto_id, stock, bodegas, leido_en, variaciones").eq("pais_id", paisId).order("dropi_producto_id").range(d, h)),
    traerTodasConError<PublicacionEffi>((d, h) =>
      supabase.from("effi_publicaciones").select("sku_maestro_id, effi_id, nombre, stock_principal, stock_garantias, en_effi, ultima_vez").eq("pais_id", paisId).order("id").range(d, h),
    ),
    traerTodasConError<PublicacionDrop>((d, h) => supabase.from("drop_publicaciones").select("sku_maestro_id, codigo, nombre, inventario, en_drop, ultima_vez").eq("pais_id", paisId).order("id").range(d, h)),
    // Qué variación de Dropi va con qué variante (migración 0261; sin ella, todo queda en el producto principal).
    traerTodasConError<VinculoVariacion>((d, h) => supabase.from("dropi_variaciones_vinculo").select("dropi_producto_id, firma, sku_maestro_id").eq("pais_id", paisId).order("id").range(d, h)),
    // Dunamixfy (migración 0263; sin ella, no se muestra y el resto carga igual).
    traerTodasConError<PublicacionDunamixfy>((d, h) => supabase.from("dunamixfy_publicaciones").select("sku_maestro_id, dunamixfy_id, nombre, stock, en_dunamixfy, ultima_vez").eq("pais_id", paisId).order("id").range(d, h)),
  ]);
  const { porProducto, lecturas } = armarStockPlataformas({ dropi: dropi.data ?? [], productosDropi: productosDropi.data ?? [], effi: effi.data ?? [], drop: drop.data ?? [], dunamixfy: dunamixfy.error ? [] : (dunamixfy.data ?? []), vinculos: vinculos.error ? [] : (vinculos.data ?? []) });
  return { porProducto, lecturas, fallaron: !!(dropi.error || productosDropi.error || effi.error || drop.error) };
}
