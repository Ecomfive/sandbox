"use server";

import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { armarStockPlataformas, type ProductoDropi, type PublicacionDrop, type PublicacionDropi, type PublicacionEffi, type StockPlataformas } from "@/lib/wms/stock-plataformas";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

export interface BodegaProducto {
  nombre: string;
  externa: boolean;
  fisico: number;
  disponible: number;
  enCamino: number;
}

export interface InventarioProducto {
  pais: string;
  bodegas: BodegaProducto[];
  /** Lo de Dropi, Effi y Drop (la última lectura de cada una), o null si no tiene nada allá. */
  plataformas: StockPlataformas | null;
  /** Lo físico en las bodegas más lo de las plataformas. */
  total: number;
}

/**
 * Cuánto hay de un producto en el país de la barra, para su ficha de Producto (9 nov 2026, pedido de Hernán: «para saber cuánta cantidad hay en inventario de ese
 * producto»): lo de cada bodega (`wms_stock_por_bodega`, lo mismo que la ficha del Inventario) y lo de las plataformas, que también cuenta como stock. Basta poder abrir Producto.
 */
export async function obtenerInventarioProducto(id: string): Promise<InventarioProducto | { error: string }> {
  await requireModulo("producto");
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [porBodega, dropi, effi, drop] = await Promise.all([
    supabase.rpc("wms_stock_por_bodega", { p_sku: id, p_pais: pais.id }),
    supabase.from("dropi_publicaciones").select("sku_maestro_id, dropi_id, nombre, estado_publicacion").eq("pais_id", pais.id).eq("sku_maestro_id", id).not("dropi_id", "is", null),
    supabase.from("effi_publicaciones").select("sku_maestro_id, effi_id, nombre, stock_principal, stock_garantias, en_effi, ultima_vez").eq("pais_id", pais.id).eq("sku_maestro_id", id),
    supabase.from("drop_publicaciones").select("sku_maestro_id, codigo, nombre, inventario, en_drop, ultima_vez").eq("pais_id", pais.id).eq("sku_maestro_id", id),
  ]);
  if (porBodega.error) return { error: "No se pudo cargar el inventario." };

  // El stock de Dropi está en la lectura de «Mis productos», por el ID de Dropi de sus publicaciones.
  const pubsDropi = (dropi.data ?? []) as PublicacionDropi[];
  const idsDropi = [...new Set(pubsDropi.flatMap((p) => (String(p.dropi_id ?? "").match(/\d{3,7}/g) ?? []).map(Number)))];
  const productosDropi = idsDropi.length
    ? ((await supabase.from("dropi_productos_proveedor").select("dropi_producto_id, stock, bodegas, leido_en").eq("pais_id", pais.id).in("dropi_producto_id", idsDropi)).data ?? [])
    : [];
  const { porProducto } = armarStockPlataformas({
    dropi: pubsDropi,
    productosDropi: productosDropi as ProductoDropi[],
    effi: (effi.data ?? []) as PublicacionEffi[],
    drop: (drop.data ?? []) as PublicacionDrop[],
  });
  const plataformas = porProducto.get(id) ?? null;

  // Las bodegas de una plataforma sin nada propio no salen: lo de allá se ve en las plataformas.
  const bodegas: BodegaProducto[] = ((porBodega.data ?? []) as Record<string, unknown>[])
    .map((b) => ({ nombre: String(b.nombre), externa: b.tipo === "externa", fisico: Number(b.fisico), disponible: Number(b.disponible), enCamino: Number(b.en_camino) }))
    .filter((b) => !b.externa || b.fisico !== 0 || b.enCamino !== 0);
  const fisico = bodegas.reduce((t, b) => t + b.fisico, 0);
  return { pais: pais.nombre, bodegas, plataformas, total: fisico + (plataformas?.total ?? 0) };
}
