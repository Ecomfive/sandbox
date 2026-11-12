"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { aplicarVinculosDeTienda, quitarVinculoDeLineas, traerProductosTienda } from "@/lib/tienda/productos-shopify";

const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/**
 * Une una variante de Shopify con un producto nuestro (o la deja sin unir con `skuId` null). La unión vive en el sistema: en Shopify no se cambia nada.
 * Al unirla deja de estar marcada como «no sale de bodega».
 */
export async function vincularVariante(varianteId: string, skuId: string | null): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("tienda-productos");
  if (!uuid(varianteId) || (skuId !== null && !uuid(skuId))) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  if (skuId) {
    const { data } = await supabase.from("skus_maestros").select("id").eq("id", skuId).maybeSingle();
    if (!data) return { error: "Ese producto ya no existe." };
  }
  const { data: antes } = await supabase.from("tienda_variantes").select("tienda_id, sku, sku_maestro_id").eq("id", varianteId).maybeSingle();
  const { error } = await supabase
    .from("tienda_variantes")
    .update({ sku_maestro_id: skuId, no_fisico: false, vinculado_por: skuId ? usuario.id : null, vinculado_en: skuId ? new Date().toISOString() : null })
    .eq("id", varianteId);
  if (error) return { error: "No se pudo guardar." };
  // Los pedidos de la tienda (12 nov 2026): sus líneas toman el producto unido, o lo pierden si se deshizo la unión.
  if (antes) {
    if (!skuId && antes.sku_maestro_id && antes.sku) await quitarVinculoDeLineas(supabase, antes.tienda_id as string, antes.sku as string, antes.sku_maestro_id as string);
    await aplicarVinculosDeTienda(supabase, antes.tienda_id as string);
  }
  revalidatePath("/tienda-productos");
  revalidatePath("/tienda-pedidos");
  return {};
}

/**
 * Trae de Shopify los productos y variantes de una tienda conectada (12 nov 2026; solo lectura) y pasa las uniones que ya hay a sus pedidos. Basta poder
 * modificar Productos de Shopify. La unión con nuestros productos no se toca.
 */
export async function traerProductosShopify(tiendaId: string): Promise<{ error?: string; resumen?: string }> {
  await requireModuloEscritura("tienda-productos");
  if (!uuid(tiendaId)) return { error: "Tienda no válida." };
  const supabase = createServiceClient();
  const { data: t } = await supabase.from("tiendas").select("id, nombre, estado").eq("id", tiendaId).maybeSingle();
  if (!t) return { error: "La tienda ya no existe." };
  if (t.estado !== "conectada") return { error: `${t.nombre} todavía no está conectada a Shopify.` };
  try {
    const r = await traerProductosTienda(supabase, { id: t.id as string, nombre: t.nombre as string });
    const lineas = await aplicarVinculosDeTienda(supabase, t.id as string);
    revalidatePath("/tienda-productos");
    revalidatePath("/tienda-pedidos");
    return {
      resumen: `${t.nombre}: ${r.productos} productos con ${r.variantes} variantes (${r.nuevas} nuevas${r.yaNoEstan ? `, ${r.yaNoEstan} ya no están en Shopify` : ""})${lineas ? ` · ${lineas} líneas de pedidos con su producto` : ""}.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron traer los productos." };
  }
}

/** Marca (o desmarca) una variante como algo que no sale de bodega (garantía extendida, envío prioritario…): no se vincula ni cuenta como vendido. */
export async function marcarNoFisico(varianteId: string, noFisico: boolean): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("tienda-productos");
  if (!uuid(varianteId)) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("tienda_variantes")
    .update({ no_fisico: noFisico, sku_maestro_id: null, vinculado_por: noFisico ? usuario.id : null, vinculado_en: noFisico ? new Date().toISOString() : null })
    .eq("id", varianteId);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/tienda-productos");
  return {};
}
