"use server";

import { sinAccesoATiendas } from "@/lib/tienda/acceso";
import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { aplicarVinculosDeTienda, quitarVinculoDeLineas, traerProductosTienda } from "@/lib/tienda/productos-shopify";
import { MAX_UNIDADES_VENTA } from "@/lib/tienda/vincular-variante";

const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
/** Las unidades por venta: un entero de 1 a 100 (18 nov 2026: un «Lleva 3» son 3 del producto). */
const unidadesValidas = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_UNIDADES_VENTA;

/**
 * Une una variante de Shopify con un producto nuestro (o la deja sin unir con `skuId` null), con cuántas unidades del producto lleva cada venta
 * (`unidades`: 2 en un «Paga 1 y lleva 2»). La unión vive en el sistema: en Shopify no se cambia nada. Al unirla deja de estar marcada como «no sale de bodega».
 */
export async function vincularVariante(varianteId: string, skuId: string | null, unidades = 1): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("tienda-productos");
  if (!uuid(varianteId) || (skuId !== null && !uuid(skuId)) || !unidadesValidas(unidades)) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  if (skuId) {
    const { data } = await supabase.from("skus_maestros").select("id").eq("id", skuId).maybeSingle();
    if (!data) return { error: "Ese producto ya no existe." };
  }
  const { data: antes } = await supabase.from("tienda_variantes").select("tienda_id, sku, sku_maestro_id").eq("id", varianteId).maybeSingle();
  // Solo variantes de las tiendas de la persona (17 nov 2026).
  if (antes) {
    const sinAcceso = await sinAccesoATiendas(supabase, [antes.tienda_id as string]);
    if (sinAcceso) return { error: sinAcceso };
  }
  const { error } = await supabase
    .from("tienda_variantes")
    .update({
      sku_maestro_id: skuId,
      unidades_por_venta: skuId ? unidades : 1,
      no_fisico: false,
      vinculado_por: skuId ? usuario.id : null,
      vinculado_en: skuId ? new Date().toISOString() : null,
    })
    .eq("id", varianteId);
  if (error) return { error: "No se pudo guardar." };
  // Los pedidos de la tienda (12 nov 2026): sus líneas toman el producto unido, o lo pierden si se deshizo la unión.
  if (antes) {
    if (!skuId && antes.sku_maestro_id && antes.sku) await quitarVinculoDeLineas(supabase, antes.tienda_id as string, antes.sku as string, antes.sku_maestro_id as string);
    await aplicarVinculosDeTienda(supabase, antes.tienda_id as string);
  }
  revalidatePath("/tienda-tiendas/productos");
  revalidatePath("/tienda-pedidos");
  return {};
}

/**
 * Confirma varias uniones de una vez (el botón «Confirmar las N con SKU o nombre igual»): las guarda todas y después pasa las uniones a los pedidos de
 * cada tienda una sola vez (12 nov 2026: confirmarlas de a una recorría todos los pedidos por cada una). Hasta 500 por vez.
 */
export async function vincularVariantesEnBloque(pares: { varianteId: string; skuId: string; unidades?: number }[]): Promise<{ error?: string; hechas?: number }> {
  const usuario = await requireModuloEscritura("tienda-productos");
  if (!Array.isArray(pares) || pares.length > 500 || pares.some((p) => !uuid(p?.varianteId) || !uuid(p?.skuId) || !unidadesValidas(p?.unidades ?? 1)))
    return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const skuIds = [...new Set(pares.map((p) => p.skuId))];
  const { data: existen } = await supabase.from("skus_maestros").select("id").in("id", skuIds);
  const validos = new Set((existen ?? []).map((x) => x.id as string));
  // Solo variantes de las tiendas de la persona (17 nov 2026).
  const { data: deVariantes } = await supabase.from("tienda_variantes").select("tienda_id").in("id", [...new Set(pares.map((p) => p.varianteId))]);
  const sinAcceso = await sinAccesoATiendas(supabase, (deVariantes ?? []).map((v) => v.tienda_id as string));
  if (sinAcceso) return { error: sinAcceso };
  const ahora = new Date().toISOString();
  let hechas = 0;
  const tiendas = new Set<string>();
  for (const p of pares) {
    if (!validos.has(p.skuId)) continue;
    const { data, error } = await supabase
      .from("tienda_variantes")
      .update({ sku_maestro_id: p.skuId, unidades_por_venta: p.unidades ?? 1, no_fisico: false, vinculado_por: usuario.id, vinculado_en: ahora })
      .eq("id", p.varianteId)
      .select("tienda_id");
    if (error) return { error: `Se guardaron ${hechas}; la siguiente falló.` };
    if (data?.[0]) tiendas.add(data[0].tienda_id as string);
    hechas++;
  }
  for (const t of tiendas) await aplicarVinculosDeTienda(supabase, t);
  revalidatePath("/tienda-tiendas/productos");
  revalidatePath("/tienda-pedidos");
  return { hechas };
}

/**
 * Cambia cuántas unidades lleva cada venta de una variante ya vinculada (18 nov 2026) y lo pasa a las líneas de los pedidos de su tienda: un pedido de un
 * «Lleva 3» descuenta y cuesta 3 del producto.
 */
export async function cambiarUnidadesVenta(varianteId: string, unidades: number): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("tienda-productos");
  if (!uuid(varianteId) || !unidadesValidas(unidades)) return { error: `Escribe un número entero de 1 a ${MAX_UNIDADES_VENTA}.` };
  const supabase = createServiceClient();
  const { data: v } = await supabase.from("tienda_variantes").select("tienda_id, sku_maestro_id").eq("id", varianteId).maybeSingle();
  if (!v) return { error: "Esa variante ya no existe." };
  if (!v.sku_maestro_id) return { error: "Primero vincula la variante a un producto." };
  const sinAcceso = await sinAccesoATiendas(supabase, [v.tienda_id as string]);
  if (sinAcceso) return { error: sinAcceso };
  const { error } = await supabase
    .from("tienda_variantes")
    .update({ unidades_por_venta: unidades, vinculado_por: usuario.id, vinculado_en: new Date().toISOString() })
    .eq("id", varianteId);
  if (error) return { error: "No se pudo guardar." };
  await aplicarVinculosDeTienda(supabase, v.tienda_id as string);
  revalidatePath("/tienda-tiendas/productos");
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
  const sinAcceso = await sinAccesoATiendas(supabase, [t.id as string]);
  if (sinAcceso) return { error: sinAcceso };
  try {
    const r = await traerProductosTienda(supabase, { id: t.id as string, nombre: t.nombre as string });
    const lineas = await aplicarVinculosDeTienda(supabase, t.id as string);
    revalidatePath("/tienda-tiendas/productos");
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
  const { data: v } = await supabase.from("tienda_variantes").select("tienda_id").eq("id", varianteId).maybeSingle();
  if (v) {
    const sinAcceso = await sinAccesoATiendas(supabase, [v.tienda_id as string]);
    if (sinAcceso) return { error: sinAcceso };
  }
  const { error } = await supabase
    .from("tienda_variantes")
    .update({ no_fisico: noFisico, sku_maestro_id: null, unidades_por_venta: 1, vinculado_por: noFisico ? usuario.id : null, vinculado_en: noFisico ? new Date().toISOString() : null })
    .eq("id", varianteId);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/tienda-tiendas/productos");
  return {};
}
